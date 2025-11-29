# LibreChat MCP-UI Node server

A starter Node.js/TypeScript MCP server that exposes `@mcp-ui/server` UI resources for LibreChat. It supports both SSE (HTTP) and stdio transports so you can plug it into `librechat.yaml` however you prefer.

## Scripts

```bash
pnpm install          # from repo root installs dependencies for this example too
pnpm --filter librechat-node-server dev:sse    # Start HTTP/SSE dev server on port 3000
pnpm --filter librechat-node-server dev:stdio  # Run stdio transport for local MCP clients
pnpm --filter librechat-node-server build      # Compile to dist/
```

## Endpoints (SSE/HTTP)
- **Stream (server → client):** `GET http://localhost:3000/mcp/ui/stream`
- **Messages (client → server):** `POST http://localhost:3000/mcp/ui/messages`
- **Session close:** `DELETE http://localhost:3000/mcp/ui/messages`

## LibreChat config examples

### SSE transport
```yaml
mcpServers:
  librechat-mcp-ui-sse:
    type: sse
    url: http://localhost:3000/mcp/ui/stream
    metadata:
      messageEndpoint: http://localhost:3000/mcp/ui/messages
      keepaliveMs: 15000
```

### Stdio transport
Build the server first (`pnpm --filter librechat-node-server build`). Then point LibreChat to the compiled stdio entry:

```yaml
mcpServers:
  librechat-mcp-ui-stdio:
    type: stdio
    command: "node"
    args:
      - "dist/stdio.js"
    workingDirectory: "<path-to-repo>/examples/librechat-node-server"
    timeout: 600000
    initTimeout: 30000
```

## Available tools
- **`showDocsLink`** – returns a UI resource that opens the MCP-UI documentation in an iframe.
- **`renderHtmlCard`** – renders a styled HTML info card with a call-to-action link.
- **`generateUiHtml`** – calls a configurable chain of AI models to synthesize sanitized HTML snippets from a prompt, with optional theme and component preferences.
- **`showRemoteDomPanel`** – emits a React-friendly Remote DOM panel with buttons that send UI events (useful for round-tripping actions through LibreChat).

These tools can be expanded or adapted to fit your own capabilities; they already return `ui://...` resources that `@mcp-ui/client` can render.

## Model configuration and chaining
- Model and provider details now live in [`src/config/modelChains.ts`](./src/config/modelChains.ts), so you can swap providers or add more agents without touching the server logic.
- The default `design-review-generate` chain runs OpenAI (planning), DeepSeek (review), and a Qwen coding model for final HTML. Each stage reads its API key from the environment:
  - `OPENAI_API_KEY`
  - `DEEPSEEK_API_KEY` (optional `DEEPSEEK_BASE_URL` override)
  - `QWEN_API_KEY` (optional `QWEN_BASE_URL` override)
- To pick a different chain from LibreChat, pass the `chain` field when calling `generateUiHtml`.

### Example prompt for UI generation
Ask LibreChat to call `generateUiHtml` with your design brief and optional parameters (including the chain name if you added more agents):

```text
Create a two-column pricing comparison for Starter vs Pro. Theme it with soft blues, include feature checkmarks, and add a primary CTA button.
Use the design-review-generate chain.
```
