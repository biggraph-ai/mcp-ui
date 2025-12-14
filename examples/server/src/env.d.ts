// Environment bindings for the example MCP server
// Extend the generated Cloudflare Env interface with Eraser configuration.
declare namespace Cloudflare {
  interface Env {
    ERASER_API_KEY?: string;
    ERASER_API_URL?: string;
  }
}

interface Env extends Cloudflare.Env {}
