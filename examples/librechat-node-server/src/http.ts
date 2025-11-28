import cors from 'cors';
import express from 'express';
import { randomUUID } from 'crypto';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(
  cors({
    origin: '*',
    exposedHeaders: ['Mcp-Session-Id'],
    allowedHeaders: ['Content-Type', 'mcp-session-id'],
  }),
);
app.use(express.json());

// Store transports per session (one MCP session per LibreChat tab).
const transports: Record<string, StreamableHTTPServerTransport> = {};

app.post('/mcp/ui/messages', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports[sid] = transport;
        console.log(`MCP Session initialized: ${sid}`);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        console.log(`MCP Session closed: ${transport.sessionId}`);
        delete transports[transport.sessionId];
      }
    };

    const server = createServer();
    await server.connect(transport);
  } else {
    return res.status(400).json({ error: { message: 'Bad Request: No valid session ID provided' } });
  }

  await transport.handleRequest(req, res, req.body);
});

const handleSessionRequest = async (req: express.Request, res: express.Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    return res.status(404).send('Session not found');
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

app.get('/mcp/ui/stream', handleSessionRequest);
app.delete('/mcp/ui/messages', handleSessionRequest);

app.listen(port, () => {
  console.log(`LibreChat MCP-UI server listening at http://localhost:${port}`);
  console.log('SSE stream: GET /mcp/ui/stream');
  console.log('Message endpoint: POST /mcp/ui/messages');
});
