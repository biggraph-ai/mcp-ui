import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createUIResource } from '@mcp-ui/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';

const app = express();
const port = 3000;

// Model endpoint for HTML transformation.
const MODEL_ENDPOINT = 'http://192.222.51.44:11434/v1';

type ModelResponse = {
  html?: string;
};

async function transformHtmlWithModel(html: string, prompt: string): Promise<string> {
  const response = await fetch(MODEL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'qwen3:30b', html, prompt }),
  });

  if (!response.ok) {
    throw new Error(`Model request failed with status ${response.status}`);
  }

  const data = (await response.json()) as ModelResponse;
  return data.html ?? html;
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
