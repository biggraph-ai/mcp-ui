import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createUIResource } from '@mcp-ui/server';
import { randomUUID } from 'crypto';

const app = express();
const port = 3000;

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

  if (sessionId && transports[sessionId]) {
    // A session already exists; reuse the existing transport.
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
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

    // Register our tools on the new server instance.
    server.registerTool('showExternalUrl', {
      title: 'Show External URL',
      description: 'Creates a UI resource displaying an external URL (example.com).',
      inputSchema: {},
    }, async () => {
      // Create the UI resource to be returned to the client
      // This is the only MCP-UI specific code in this example
      const uiResource = createUIResource({
        uri: 'ui://greeting',
        content: { type: 'externalUrl', iframeUrl: 'https://example.com' },
        encoding: 'text',
      });

      return {
        content: [uiResource],
      };
    });

    server.registerTool('showRawHtml', {
      title: 'Show Raw HTML',
      description: 'Creates a UI resource displaying raw HTML.',
      inputSchema: {},
    }, async () => {
      const uiResource = createUIResource({
        uri: 'ui://raw-html-demo',
        content: { type: 'rawHtml', htmlString: '<h1>Hello from Raw HTML</h1>' },
        encoding: 'text',
      });

      return {
        content: [uiResource],
      };
    });

    server.registerTool('showRemoteDom', {
      title: 'Show Remote DOM',
      description: 'Creates a UI resource displaying a remote DOM script.',
      inputSchema: {},
    }, async () => {
      const remoteDomScript = `
        const p = document.createElement('ui-text');
        p.textContent = 'This is a remote DOM element from the server.';
        root.appendChild(p);
      `;
      const uiResource = createUIResource({
        uri: 'ui://remote-dom-demo',
        content: {
          type: 'remoteDom',
          script: remoteDomScript,
          framework: 'react',
        },
        encoding: 'text',
      });

      return {
        content: [uiResource],
      };
    });

    server.registerTool('generateEraserDiagram', {
      title: 'Generate Eraser Diagram',
      description:
        'Creates a diagram image using the Eraser AI Diagram API and displays it as a UI resource.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Detailed description of the diagram to render.',
          },
          format: {
            type: 'string',
            enum: ['png', 'jpeg', 'webp'],
            default: 'png',
          },
          aspectRatio: {
            type: 'string',
            description: 'Optional aspect ratio (e.g. 16:9, 1:1).',
          },
          title: {
            type: 'string',
            description: 'Optional title displayed above the rendered diagram.',
          },
        },
        required: ['prompt'],
      },
    }, async ({ prompt, format = 'png', aspectRatio, title }) => {
      const apiKey = process.env.ERASER_API_KEY;

      if (!apiKey) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'ERASER_API_KEY is not set in the environment. Add it to your .env file to enable diagram generation.',
            },
          ],
        };
      }

      const endpoint = process.env.ERASER_API_URL ?? 'https://app.eraser.io/api/render';

      const requestBody = {
        prompt,
        format,
        aspectRatio,
      } satisfies Record<string, string | undefined>;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(stripUndefined(requestBody)),
      });

      const rawResponse = await response.text();

      let parsedResponse: Record<string, unknown> = {};
      if (rawResponse) {
        try {
          parsedResponse = JSON.parse(rawResponse) as Record<string, unknown>;
        } catch (error) {
          throw new Error(`Eraser API returned a non-JSON response: ${rawResponse}`);
        }
      }

      if (!response.ok) {
        const errorMessage =
          (typeof parsedResponse.error === 'string' && parsedResponse.error) ||
          (typeof parsedResponse.message === 'string' && parsedResponse.message) ||
          rawResponse ||
          response.statusText;

        throw new Error(`Eraser API request failed (${response.status}): ${errorMessage}`);
      }

      const imageSrc = normalizeEraserImage(parsedResponse, format);
      const externalUrl = pickEraserLink(parsedResponse);

      const resourceBlock = createUIResource({
        uri: `ui://eraser-diagram/${Date.now()}`,
        content: {
          type: 'rawHtml',
          htmlString: renderEraserDiagramHtml({
            imageSrc,
            prompt,
            externalUrl,
            title: title ?? 'Eraser AI Diagram',
          }),
        },
        encoding: 'text',
      });

      return {
        content: [resourceBlock],
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

type EraserResponse = {
  imageUrl?: unknown;
  image_url?: unknown;
  diagramUrl?: unknown;
  url?: unknown;
  image?: unknown;
  imageBase64?: unknown;
  image_base64?: unknown;
};

function pickEraserLink(response: EraserResponse): string | undefined {
  const candidates = [response.diagramUrl, response.imageUrl, response.image_url, response.url];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      try {
        const parsed = new URL(candidate);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
          return parsed.toString();
        }
      } catch (error) {
        console.warn('Eraser API returned an invalid URL:', candidate, error);
      }
    }
  }

  return undefined;
}

function normalizeEraserImage(response: EraserResponse, format: string): string {
  const base64Image =
    (typeof response.imageBase64 === 'string' && response.imageBase64) ||
    (typeof response.image_base64 === 'string' && response.image_base64) ||
    (typeof response.image === 'string' && response.image);

  if (base64Image) {
    return base64Image.startsWith('data:image/')
      ? base64Image
      : `data:image/${format};base64,${base64Image}`;
  }

  const link = pickEraserLink(response);
  if (link) {
    return link;
  }

  throw new Error('Eraser API response did not include an image URL or base64 payload.');
}

function renderEraserDiagramHtml({
  imageSrc,
  prompt,
  externalUrl,
  title,
}: {
  imageSrc: string;
  prompt: string;
  externalUrl?: string;
  title: string;
}): string {
  const safeTitle = escapeHtml(title);
  const safePrompt = escapeHtml(prompt);
  const safeImageSrc = escapeAttribute(imageSrc);
  const safeExternalUrl = externalUrl ? escapeAttribute(externalUrl) : undefined;

  return `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; padding: 16px; max-width: 900px; margin: 0 auto;">
      <div style="background: white; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.07); overflow: hidden;">
        <div style="padding: 16px 20px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #e2e8f0; background: linear-gradient(120deg, #0ea5e9 0%, #14b8a6 100%); color: white;">
          <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.18); display: grid; place-items: center; font-weight: 700; font-size: 18px;">AI</div>
          <div>
            <div style="font-weight: 700; font-size: 16px;">${safeTitle}</div>
            <div style="opacity: 0.92; font-size: 13px;">Rendered by the Eraser AI Diagram API</div>
          </div>
          ${
            safeExternalUrl
              ? `<a href="${safeExternalUrl}" target="_blank" rel="noreferrer" style="margin-left: auto; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.28); color: white; padding: 8px 12px; border-radius: 10px; font-weight: 600; text-decoration: none;">Open in Eraser</a>`
              : ''
          }
        </div>
        <div style="padding: 20px;">
          <div style="background: #0b1220; border-radius: 12px; overflow: hidden; border: 1px solid #0f172a;">
            <img src="${safeImageSrc}" alt="Eraser diagram" style="display: block; width: 100%; max-height: 640px; object-fit: contain; background: #0b1220;" />
          </div>
          <div style="margin-top: 14px; background: #f1f5f9; border-radius: 12px; padding: 14px 16px; border: 1px solid #e2e8f0;">
            <div style="font-weight: 700; color: #0f172a; margin-bottom: 6px;">Prompt</div>
            <div style="font-family: 'SFMono-Regular', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 13px; white-space: pre-wrap; color: #334155;">${safePrompt}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function stripUndefined<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
