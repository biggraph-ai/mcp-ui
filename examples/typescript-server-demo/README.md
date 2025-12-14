# typescript-server-demo

This barebones server demonstrates how to use `@mcp-ui/server` to generate UI resources from two tools:

- `transformHtml`, which accepts `html` and `prompt` input, forwards them to your model provider, and returns MCP-UI raw HTML output.
- `generate_eraser_diagram`, which calls the Eraser AI Diagram API to create a diagram image (optionally from a base64-encoded PNG attachment) and returns it as a rendered UI resource. Provide an `apiKey` input or set the `ERASER_API_KEY` environment variable before invoking it.

For a detailed explanation of how this server works, see the [TypeScript Server Walkthrough](https://mcpui.dev/guide/server/typescript/walkthrough.html). Note that the walkthrough uses multiple tools for illustration, while this demo focuses on a single HTML-transforming tool.

## Running the server

To run the server in development mode, first install the dependencies, then run the `dev` command:

```bash
pnpm install
pnpm dev
```

The server will be available at `http://localhost:3000`.

You can view the UI resources from this server by connecting to it with the [`ui-inspector`](https://github.com/idosal/ui-inspector) (target `http://localhost:3000/mcp` with Streamable HTTP Transport Type).

## Streaming (SSE) support

The server uses the `StreamableHTTPServerTransport`, which exposes SSE for server-to-client messages via `GET /mcp` when the client sets `Accept: text/event-stream` and includes the `Mcp-Session-Id` header returned during initialization. This matches the Streamable HTTP specification and allows compatible hosts to stream responses without additional configuration.

