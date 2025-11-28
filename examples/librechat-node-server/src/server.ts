import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createUIResource } from '@mcp-ui/server';

export function createServer() {
  const server = new McpServer({
    name: 'librechat-node-server',
    version: '1.0.0',
  });

  server.registerTool(
    'showDocsLink',
    {
      title: 'Show MCP-UI Docs',
      description: 'Return a UI resource that opens the MCP-UI documentation.',
      inputSchema: {},
    },
    async () => {
      const uiResource = createUIResource({
        uri: 'ui://docs-link',
        content: {
          type: 'externalUrl',
          iframeUrl: 'https://modelcontextprotocol.io/guides/ui/getting-started',
        },
        encoding: 'text',
      });

      return { content: [uiResource] };
    },
  );

  server.registerTool(
    'renderHtmlCard',
    {
      title: 'Render HTML card',
      description: 'Display a custom HTML snippet with a CTA.',
      inputSchema: {},
    },
    async () => {
      const htmlString = `
        <section style="font-family: sans-serif; padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 520px; margin: 0 auto;">
          <h1 style="margin-top: 0; color: #111827;">LibreChat MCP-UI starter</h1>
          <p style="color: #4b5563;">This card is rendered by <code>@mcp-ui/server</code> using raw HTML.</p>
          <a href="https://github.com/modelcontextprotocol/servers" target="_blank" style="display: inline-block; margin-top: 12px; background: #2563eb; color: white; padding: 10px 14px; border-radius: 8px; text-decoration: none;">Browse sample servers</a>
        </section>
      `;

      const uiResource = createUIResource({
        uri: 'ui://html-card',
        content: { type: 'rawHtml', htmlString },
        encoding: 'text',
      });

      return { content: [uiResource] };
    },
  );

  server.registerTool(
    'showRemoteDomPanel',
    {
      title: 'Show Remote DOM panel',
      description: 'Render a React-friendly Remote DOM widget with quick actions.',
      inputSchema: {},
    },
    async () => {
      const remoteDomScript = `
        const header = document.createElement('ui-text');
        header.textContent = 'MCP UI Remote DOM Panel';
        header.variant = 'heading';

        const description = document.createElement('ui-text');
        description.textContent = 'Trigger lightweight actions that flow back through LibreChat.';

        const buttonRow = document.createElement('ui-flex');
        buttonRow.direction = 'row';
        buttonRow.gap = '0.75rem';

        const buttons = [
          { label: 'Ping', value: 'ping' },
          { label: 'Open Docs', value: 'docs' },
          { label: 'Refresh', value: 'refresh' }
        ];

        buttons.forEach(({ label, value }) => {
          const button = document.createElement('ui-button');
          button.textContent = label;
          button.variant = 'primary';
          button.addEventListener('click', () => {
            dispatchUIEvent({ type: 'ui-action', payload: { action: value } });
          });
          buttonRow.appendChild(button);
        });

        const log = document.createElement('ui-text');
        log.id = 'action-log';
        log.color = 'muted';
        log.textContent = 'Waiting for an action…';

        root.appendChild(header);
        root.appendChild(description);
        root.appendChild(buttonRow);
        root.appendChild(log);

        addEventListener('ui-context', (event) => {
          const { action } = event.detail.payload;
          const logEl = document.querySelector('#action-log');
          if (logEl) {
            logEl.textContent = 'Last action: ' + action;
          }
        });
      `;

      const uiResource = createUIResource({
        uri: 'ui://remote-dom-panel',
        content: {
          type: 'remoteDom',
          script: remoteDomScript,
          framework: 'react',
        },
        encoding: 'text',
      });

      return { content: [uiResource] };
    },
  );

  return server;
}
