import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createUIResource } from '@mcp-ui/server';
import { z } from 'zod';
import { getModelChain, type AgentStage, type ModelProvider } from './config/modelChains.js';

const PROVIDER_KEY_ENV: Record<ModelProvider, string> = {
  openai: 'OPENAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  qwen: 'QWEN_API_KEY',
};

function sanitizeHtml(html: string) {
  // Remove script tags and inline event handlers to reduce risk from model output.
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]+/gi, '')
    .trim();
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
      title: 'Generate UI HTML',
      description: 'Use an AI model to generate sanitized HTML UI snippets for LibreChat.',
      inputSchema: {
        prompt: z.string().describe('Primary design prompt or user instructions for the UI.'),
        theme: z.string().optional().describe('Optional theme or visual style to apply to the HTML output.'),
        components: z
          .array(z.string())
          .optional()
          .describe('Optional list of components to prioritize (buttons, inputs, cards, etc.).'),
        chain: z
          .string()
          .optional()
          .describe('Model chain identifier from src/config/modelChains.ts to use for multi-agent reasoning.'),
      },
    },
    async ({ prompt, theme, components, chain }: { prompt: string; theme?: string; components?: string[]; chain?: string }) => {
      const chainConfig = getModelChain(chain);

      const composedPrompt = [
        prompt,
        theme ? `Theme preference: ${theme}.` : '',
        components?.length ? `Highlight components: ${components.join(', ')}.` : '',
        'Prioritize semantic, accessible HTML with inline styles only.',
      ]
        .filter(Boolean)
        .join('\n');

      const missingApiStages = chainConfig.stages
        .filter((stage) => stage.apiKeyEnv)
        .map((stage) => ({
          stage,
          // Treat both the configured env var and provider default as valid, so we
          // don't break users who keep OPENAI_API_KEY set but accidentally changed
          // the chain to point at a literal key value.
          envCandidates: [stage.apiKeyEnv, PROVIDER_KEY_ENV[stage.provider]].filter(Boolean) as string[],
        }))
        .filter(({ envCandidates }) => {
          return !envCandidates.some((candidate) => /^[A-Z0-9_]+$/.test(candidate) && process.env[candidate]);
        })
        .map(({ stage, envCandidates }) => {
          const displayEnvVar = envCandidates.find((candidate) => /^[A-Z0-9_]+$/.test(candidate));
          return {
            label: stage.label,
            provider: stage.provider,
            envVar: displayEnvVar ?? PROVIDER_KEY_ENV[stage.provider] ?? 'API_KEY',
          };
        });

      if (missingApiStages.length) {
        const missingList = missingApiStages
          .map((stage) => `<li><strong>${stage.label}</strong> (${stage.provider}) via <code>${stage.envVar}</code></li>`)
          .join('');

        const exportBlock = missingApiStages
          .map((stage) => `${stage.envVar}=<${stage.provider}-api-key> # required for ${stage.label}`)
          .join('\n');

        const fallbackHtml = `
          <section style="font-family: sans-serif; padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 540px; margin: 0 auto;">
            <h2 style="margin-top: 0;">Model configuration missing</h2>
            <p style="color: #4b5563;">Provide API keys for each configured stage to enable chained generation:</p>
            <ul style="color: #374151; padding-left: 18px;">${missingList}</ul>
            <p style="color: #4b5563;">Add the following to your environment or .env.local file:</p>
            <pre style="background: #f9fafb; color: #111827; padding: 12px; border-radius: 8px; border: 1px solid #e5e7eb;">${exportBlock}</pre>
            <p style="color: #6b7280;">Only environment variable names are shown here. If you pasted an API key directly into the chain config, move it into the matching environment variable instead.</p>
          </section>
        `;

        return {
          content: [
            createUIResource({
              uri: 'ui://generate-ui-html/error',
              content: { type: 'rawHtml', htmlString: fallbackHtml.trim() },
              encoding: 'text',
            }),
          ],
        };
      }

      let plan = '';
      let review = '';
      let finalHtml = '';

      try {
        for (const stage of chainConfig.stages) {
          const messages = buildStageMessages({
            stage,
            prompt: composedPrompt,
            plan,
            review,
          });

          const responseText = await invokeModel(stage, messages);

          if (stage.role === 'planner') {
            plan = responseText;
          } else if (stage.role === 'reviewer') {
            review = responseText;
          } else {
            finalHtml = sanitizeHtml(responseText);
          }
        }

        if (!finalHtml) {
          throw new Error('Model chain completed without HTML output');
        }

        const uiResource = createUIResource({
          uri: 'ui://generate-ui-html/result',
          content: { type: 'rawHtml', htmlString: finalHtml },
          encoding: 'text',
        });

        return { content: [uiResource] };
      } catch (error) {
        console.error('generateUiHtml chain error:', error);

        const friendlyHtml = `
          <section style="font-family: sans-serif; padding: 16px; border: 1px solid #fecdd3; background: #fff1f2; border-radius: 12px; max-width: 520px; margin: 0 auto; color: #9f1239;">
            <h3 style="margin-top: 0;">We couldn\'t generate your UI</h3>
            <p style="color: #b91c1c;">Please try again or adjust your prompt. If the issue persists, check model credentials and network access.</p>
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

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const providerBaseUrls: Record<ModelProvider, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
};

function buildStageMessages({
  stage,
  prompt,
  plan,
  review,
}: {
  stage: AgentStage;
  prompt: string;
  plan: string;
  review: string;
}): ChatMessage[] {
  if (stage.role === 'planner') {
    return [
      {
        role: 'system',
        content:
          'You are a UI layout planner. Summarize the requested interface, list key sections, and outline an accessible structure.',
      },
      { role: 'user', content: prompt },
    ];
  }

  if (stage.role === 'reviewer') {
    return [
      {
        role: 'system',
        content:
          'You are an accessibility and UX reviewer. Provide concise improvements and guardrails for the UI plan.',
      },
      { role: 'user', content: `Original prompt:\n${prompt}\n\nCurrent plan:\n${plan || 'No plan yet.'}` },
    ];
  }

  return [
    {
      role: 'system',
      content:
        'You are a front-end coder. Generate final HTML only (no Markdown fences), with inline styles and ARIA-friendly markup.',
    },
    {
      role: 'user',
      content: [
        `Prompt:\n${prompt}`,
        plan ? `Planned structure:\n${plan}` : '',
        review ? `Review notes:\n${review}` : '',
        'Return a compact, production-ready snippet. Avoid external assets and scripts.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}

function stripMarkdownFences(text: string) {
  return text.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
}

async function invokeModel(stage: AgentStage, messages: ChatMessage[]) {
  const apiKey = stage.apiKeyEnv ? process.env[stage.apiKeyEnv] : undefined;
  if (stage.apiKeyEnv && !apiKey) {
    throw new Error(`Missing API key for ${stage.id} (${stage.apiKeyEnv})`);
  }

  const customBaseUrl = stage.baseUrlEnv ? process.env[stage.baseUrlEnv] : undefined;
  const endpointBase = customBaseUrl || providerBaseUrls[stage.provider];
  const endpoint = `${endpointBase}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: stage.model,
      messages,
      max_tokens: stage.maxTokens ?? 600,
      temperature: stage.temperature ?? 0.4,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Model request failed for ${stage.id}: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(`Model ${stage.id} returned no content`);
  }

  return stripMarkdownFences(text);
}
