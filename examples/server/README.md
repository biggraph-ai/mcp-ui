This example features a complete MCP remote server hosted on Cloudflare.

The server is the standard Cloudflare auth-less boilerplate. The only part relevant to `mcp-ui` is in the tool definitions (`src/index.ts`), where we return a UI resource created using `createUIResource` instead of a string.

## Eraser AI diagram support

The example server now includes a `generate_eraser_diagram` tool that calls the Eraser AI Diagram API, then wraps the rendered image in a `ui://` resource so MCP hosts can display it inline. To enable it, add your credentials to `wrangler.jsonc` or your deployment environment:

```
{
  "vars": {
    "ERASER_API_KEY": "<your_api_token>",
    "ERASER_API_URL": "https://app.eraser.io/api/render"
  }
}
```

The tool accepts a prompt plus optional `format`, `aspectRatio`, and `title` fields. The response is rendered as HTML with a data URL or external link returned by the API.