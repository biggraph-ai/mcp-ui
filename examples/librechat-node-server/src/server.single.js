import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createUIResource } from '@mcp-ui/server';
import { z } from 'zod';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = 'gpt-4o-mini';

function sanitizeHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]+/gi, '')
    .trim();
}

function buildMessages(prompt, theme, components) {
  const composedPrompt = [
    prompt,
    theme ? `Theme preference: ${theme}.` : '',
    components?.length ? `Highlight components: ${components.join(', ')}.` : '',
    'Prioritize semantic, accessible HTML with inline styles only.',
  ]
    .filter(Boolean)
    .join('\n');

  return [
    {
      role: 'system',
      content:
        'You are a front-end coder. Generate final HTML only (no Markdown fences), with inline styles and ARIA-friendly markup.',
    },
    { role: 'user', content: composedPrompt },
  ];
}

async function callOpenAi(messages) {
  if (!OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      max_tokens: 600,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenAI returned no content');
  }

  return content.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
}

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
    'generateUiHtml',
    {
      title: 'Generate UI HTML (single OpenAI model)',
      description: 'Call one OpenAI model to return sanitized HTML UI snippets for LibreChat.',
      inputSchema: {
        prompt: z.string().describe('Primary design prompt or user instructions for the UI.'),
        theme: z.string().optional().describe('Optional theme or visual style to apply to the HTML output.'),
        components: z
          .array(z.string())
          .optional()
          .describe('Optional list of components to prioritize (buttons, inputs, cards, etc.).'),
      },
    },
    async ({ prompt, theme, components }) => {
      try {
        const messages = buildMessages(prompt, theme, components);
        const rawHtml = await callOpenAi(messages);
        const sanitizedHtml = sanitizeHtml(rawHtml);

        const uiResource = createUIResource({
          uri: 'ui://generate-ui-html/result',
          content: { type: 'rawHtml', htmlString: sanitizedHtml },
          encoding: 'text',
        });

        return { content: [uiResource] };
      } catch (error) {
        const friendlyHtml = `
          <section style="font-family: sans-serif; padding: 16px; border: 1px solid #fecdd3; background: #fff1f2; border-radius: 12px; max-width: 520px; margin: 0 auto; color: #9f1239;">
            <h3 style="margin-top: 0;">We couldn't generate your UI</h3>
            <p style="color: #b91c1c;">${error instanceof Error ? error.message : 'Unknown error occurred.'}</p>
            <p style="color: #6b7280;">Ensure OPENAI_API_KEY is set and try again.</p>
          </section>
        `;

        return {
          content: [
            createUIResource({
              uri: 'ui://generate-ui-html/error',
              content: { type: 'rawHtml', htmlString: friendlyHtml.trim() },
              encoding: 'text',
            }),
          ],
        };
      }
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

export default createServer;
