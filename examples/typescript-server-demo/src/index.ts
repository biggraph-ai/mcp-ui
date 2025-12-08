import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createUIResource } from '@mcp-ui/server';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';

const app = express();
const port = 3000;

// Base URL for the model endpoint (defaults to Ollama's OpenAI-compatible API).
const MODEL_ENDPOINT = 'http://192.222.51.44:11434/v1';
const LOG_BASE_DIR = path.resolve(process.cwd(), 'html-logs');

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

async function transformHtmlWithModel(html: string, prompt: string): Promise<string> {
  const completionUrl = new URL('chat/completions', `${MODEL_ENDPOINT.replace(/\/$/, '')}/`).toString();
  // Abort the model call if it takes too long to avoid 30s tool timeouts downstream.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(completionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3:30b',
        stream: false,
        messages: [
          {
            role: 'system',
            content: 'Transform the provided HTML according to the user prompt. Return only the resulting HTML.',
          },
          {
            role: 'user',
            content: `Prompt: ${prompt}\nHTML:\n${html}`,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Model request failed with status ${response.status}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const modelHtml = data.choices?.[0]?.message?.content;
    return modelHtml?.trim() ?? html;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      console.warn('Model request timed out after 25s; returning original HTML.');
      return html;
    }

    console.error('Model request failed:', error);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function logHtmlSnapshot({
  html,
  prompt,
  transformedHtml,
}: {
  html: string;
  prompt: string;
  transformedHtml: string;
}): Promise<void> {
  const snapshotDir = path.join(LOG_BASE_DIR, `html-log-${randomUUID()}`);

  try {
    await fs.mkdir(snapshotDir, { recursive: true });

    await Promise.all([
      fs.writeFile(path.join(snapshotDir, 'prompt.txt'), prompt, 'utf8'),
      fs.writeFile(path.join(snapshotDir, 'input.html'), html, 'utf8'),
      fs.writeFile(path.join(snapshotDir, 'output.html'), transformedHtml, 'utf8'),
    ]);
  } catch (error) {
    console.error('Failed to log HTML snapshot:', error);
  }
}

app.use(cors({
  origin: '*',
  exposedHeaders: ['Mcp-Session-Id'],
  allowedHeaders: ['Content-Type', 'mcp-session-id'],
}));
app.use(express.json());

// Map to store transports by session ID, as shown in the documentation.
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Handle POST requests for client-to-server communication.
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;
  const requestIsInitialize = isInitializeRequest(req.body);

  if (sessionId && transports[sessionId]) {
    // A session already exists; reuse the existing transport.
    if (requestIsInitialize) {
      // Gracefully return a JSON-RPC error instead of a transport-level 400 so
      // clients can keep the connection alive without triggering retries.
      return res.status(200).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: {
          code: -32600,
          message: 'Server already initialized. Reuse the existing session or omit MCP-Session-Id to start a new one.',
        },
      });
    }

    transport = transports[sessionId];
  } else if (requestIsInitialize) {
    // This is a new initialization request. Create a new transport.
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports[sid] = transport;
        console.log(`MCP Session initialized: ${sid}`);
      },
    });

    // Clean up the transport from our map when the session closes.
    transport.onclose = () => {
      if (transport.sessionId) {
        console.log(`MCP Session closed: ${transport.sessionId}`);
        delete transports[transport.sessionId];
      }
    };
    
    // Create a new server instance for this specific session.
    const server = new McpServer({
      name: "typescript-server-demo",
      version: "1.0.0"
    });

    const transformHtmlInputSchema = {
      html: z.string().describe('The source HTML to transform.'),
      prompt: z.string().describe('Instructions describing how to transform the HTML.'),
    } satisfies z.ZodRawShape;

    type TransformHtmlInput = z.infer<z.ZodObject<typeof transformHtmlInputSchema>>;

    // Register a single tool for transforming HTML with a model provider.
    server.registerTool('transformHtml', {
      title: 'Transform HTML',
      description: 'Transforms HTML based on a prompt using a model provider.',
      inputSchema: transformHtmlInputSchema,
    }, async ({ html, prompt }: TransformHtmlInput) => {
      const transformedHtml = await transformHtmlWithModel(html, prompt);

      await logHtmlSnapshot({ html, prompt, transformedHtml });

      const uiResource = createUIResource({
        uri: 'ui://transformed',
        content: { type: 'rawHtml', htmlString: transformedHtml },
        encoding: 'text',
      });

      return {
        content: [uiResource],
      };
    });
  
    // Connect the server instance to the transport for this session.
    await server.connect(transport);
  } else {
    return res.status(400).json({
      error: { message: 'Bad Request: No valid session ID provided' },
    });
  }

  // Handle the client's request using the session's transport.
  await transport.handleRequest(req, res, req.body);
});

// A separate, reusable handler for GET and DELETE requests.
const handleSessionRequest = async (req: express.Request, res: express.Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  console.log('sessionId', sessionId);
  if (!sessionId || !transports[sessionId]) {
    return res.status(404).send('Session not found');
  }
  
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

// GET handles the long-lived stream for server-to-client messages.
app.get('/mcp', handleSessionRequest);

// DELETE handles explicit session termination from the client.
app.delete('/mcp', handleSessionRequest);

app.listen(port, () => {
  console.log(`TypeScript MCP server listening at http://localhost:${port}`);
});
