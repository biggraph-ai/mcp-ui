# typescript-server-demo

This barebones server demonstrates how to use `@mcp-ui/server` to generate all three types of UI resources via several tools:

- `showExternalUrl`: Renders an `<iframe>` pointing to an external URL.
- `showRawHtml`: Renders a static block of HTML.
- `showRemoteDom`: Executes a script that uses a custom component (`<ui-text>`) to render content, demonstrating how to leverage a client-side component library.
- `generateEraserDiagram`: Calls the Eraser AI Diagram API and wraps the rendered image in a UI resource for inline display. Set `ERASER_API_KEY` (and optionally `ERASER_API_URL`) in your environment to enable this tool.

For a detailed explanation of how this server works, see the [TypeScript Server Walkthrough](https://mcpui.dev/guide/server/typescript/walkthrough.html).

## Running the server

To run the server in development mode, first install the dependencies, then run the `dev` command:

```bash
pnpm install
pnpm dev
```

The server will be available at `http://localhost:3000`.

You can view the UI resources from this server by connecting to it with the [`ui-inspector`](https://github.com/idosal/ui-inspector) (target `http://localhost:3000/mcp` with Streamable HTTP Transport Type).

