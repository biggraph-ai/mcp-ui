import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createRequestHandler } from 'react-router';
import { createUIResource } from '@mcp-ui/server';

declare module 'react-router' {
  export interface AppLoadContext {
    cloudflare: {
      env: CloudflareEnvironment;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
);

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
  server = new McpServer({
    name: 'MCP-UI Example',
    version: '1.0.0',
  });

  async init() {
    const requestUrl = this.props.requestUrl as string;
    const url = new URL(requestUrl);
    const requestHost = url.host;

    this.server.tool(
      'get_tasks_status',
      'The main way to get a textual representation of the status of all tasks',
      async () => {
        const todayData = {
          alice: { remaining: 12, toDo: 5, inProgress: 4, blocked: 3 },
          bob: { remaining: 18, toDo: 11, inProgress: 4, blocked: 3 },
          charlie: { remaining: 14, toDo: 6, inProgress: 5, blocked: 3 },
        };

        // Full sprint data for weekly summary
        const sprintDataFull = [
          {
            date: '5/10',
            alice: { remaining: 8, toDo: 3, inProgress: 3, blocked: 2 },
            bob: { remaining: 7, toDo: 2, inProgress: 3, blocked: 2 },
            charlie: { remaining: 9, toDo: 4, inProgress: 3, blocked: 2 },
          },
          {
            date: '5/11',
            alice: { remaining: 7, toDo: 2, inProgress: 3, blocked: 2 },
            bob: { remaining: 6, toDo: 2, inProgress: 2, blocked: 2 },
            charlie: { remaining: 8, toDo: 3, inProgress: 3, blocked: 2 },
          },
          {
            date: '5/12',
            alice: { remaining: 9, toDo: 3, inProgress: 4, blocked: 2 },
            bob: { remaining: 8, toDo: 3, inProgress: 3, blocked: 2 },
            charlie: { remaining: 10, toDo: 4, inProgress: 4, blocked: 2 },
          },
          {
            date: '5/13',
            alice: { remaining: 6, toDo: 1, inProgress: 2, blocked: 3 },
            bob: { remaining: 9, toDo: 3, inProgress: 3, blocked: 3 },
            charlie: { remaining: 11, toDo: 5, inProgress: 3, blocked: 3 },
          },
          {
            date: '5/14',
            alice: { remaining: 10, toDo: 4, inProgress: 3, blocked: 3 },
            bob: { remaining: 9, toDo: 3, inProgress: 3, blocked: 3 },
            charlie: { remaining: 12, toDo: 5, inProgress: 4, blocked: 3 },
          },
          {
            date: '5/15',
            alice: { remaining: 11, toDo: 4, inProgress: 4, blocked: 3 },
            bob: { remaining: 10, toDo: 3, inProgress: 4, blocked: 3 },
            charlie: { remaining: 13, toDo: 6, inProgress: 4, blocked: 3 },
          },
          {
            date: '5/16',
            alice: { remaining: 12, toDo: 5, inProgress: 4, blocked: 3 },
            bob: { remaining: 11, toDo: 4, inProgress: 4, blocked: 3 },
            charlie: { remaining: 14, toDo: 6, inProgress: 5, blocked: 3 },
          },
        ];
        const teamMembers = ['alice', 'bob', 'charlie'];

        let statusText = "Today's Task Status:\n\n";

        statusText += 'Alice:\n';
        statusText += `  To Do: ${todayData.alice.toDo}\n`;
        statusText += `  In Progress: ${todayData.alice.inProgress}\n`;
        statusText += `  Blocked: ${todayData.alice.blocked}\n`;
        statusText += `  Remaining: ${todayData.alice.remaining}\n\n`;

        statusText += 'Bob:\n';
        statusText += `  To Do: ${todayData.bob.toDo}\n`;
        statusText += `  In Progress: ${todayData.bob.inProgress}\n`;
        statusText += `  Blocked: ${todayData.bob.blocked}\n`;
        statusText += `  Remaining: ${todayData.bob.remaining}\n\n`;

        statusText += 'Charlie:\n';
        statusText += `  To Do: ${todayData.charlie.toDo}\n`;
        statusText += `  In Progress: ${todayData.charlie.inProgress}\n`;
        statusText += `  Blocked: ${todayData.charlie.blocked}\n`;
        statusText += `  Remaining: ${todayData.charlie.remaining}\n`;

        // Calculate weekly totals
        let weeklyTotalToDo = 0;
        let weeklyTotalInProgress = 0;
        let weeklyTotalBlocked = 0;

        sprintDataFull.forEach((day) => {
          teamMembers.forEach((member) => {
            // @ts-expect-error - member is a string, but it's used as an index type for day
            weeklyTotalToDo += day[member]?.toDo || 0;
            // @ts-expect-error - member is a string, but it's used as an index type for day
            weeklyTotalInProgress += day[member]?.inProgress || 0;
            // @ts-expect-error - member is a string, but it's used as an index type for day
            weeklyTotalBlocked += day[member]?.blocked || 0;
          });
        });

        statusText += '\n\nSummary for the past week:\n';
        statusText += `Total tasks To Do: ${weeklyTotalToDo}\n`;
        statusText += `Total tasks In Progress: ${weeklyTotalInProgress}\n`;
        statusText += `Total tasks Blocked: ${weeklyTotalBlocked}\n`;

        return {
          content: [{ type: 'text', text: statusText }],
        };
      },
    );

    this.server.tool('nudge_team_member', { name: z.string() }, async ({ name }) => ({
      content: [{ type: 'text', text: 'Nudged ' + name + '!' }],
    }));

    this.server.tool(
      'show_task_status',
      'Displays a UI for the user to see the status of tasks. Use get_tasks_status unless asked to SHOW the status',
      async () => {
        const scheme =
          requestHost.includes('localhost') || requestHost.includes('127.0.0.1') ? 'http' : 'https';

        const pickerPageUrl = `${scheme}://${requestHost}/task`;

        // Generate a unique URI for this specific invocation of the file picker UI.
        // This URI identifies the resource block itself, not the content of the iframe.
        const uniqueUIAppUri = `ui://task-manager/${Date.now()}` as `ui://${string}`;
        const resourceBlock = createUIResource({
          uri: uniqueUIAppUri,
          content: { type: 'externalUrl', iframeUrl: pickerPageUrl },
          encoding: 'text', // The URL itself is delivered as text
        });

        return {
          content: [resourceBlock],
        };
      },
    );
    this.server.tool(
      'show_user_status',
      'Displays a UI for the user to see the status of a user and their tasks',
      { id: z.string(), name: z.string(), avatarUrl: z.string() },
      async ({ id, name, avatarUrl }) => {
        const scheme =
          requestHost.includes('localhost') || requestHost.includes('127.0.0.1') ? 'http' : 'https';

        const pickerPageUrl = `${scheme}://${requestHost}/user?id=${id}&name=${name}&avatarUrl=${avatarUrl}`;

        // Generate a unique URI for this specific invocation of the file picker UI.
        // This URI identifies the resource block itself, not the content of the iframe.
        const uniqueUIAppUri = `ui://user-profile/${Date.now()}` as `ui://${string}`;
        const resourceBlock = createUIResource({
          uri: uniqueUIAppUri,
          content: { type: 'externalUrl', iframeUrl: pickerPageUrl },
          encoding: 'text', // The URL itself is delivered as text
        });

        return {
          content: [resourceBlock],
        };
      },
    );

    this.server.tool(
      'generate_eraser_diagram',
      'Creates a diagram image using the Eraser AI Diagram API and displays it as a UI resource.',
      {
        prompt: z.string().describe('Detailed description of the diagram to render.'),
        format: z.enum(['png', 'jpeg', 'webp']).optional().default('png'),
        aspectRatio: z.string().optional(),
        title: z.string().optional(),
      },
      async ({ prompt, format = 'png', aspectRatio, title }) => {
        const apiKey = this.env.ERASER_API_KEY;

        if (!apiKey) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'ERASER_API_KEY is not set in the Worker environment. Add it to wrangler.jsonc to enable diagram generation.',
              },
            ],
          };
        }

        const endpoint = this.env.ERASER_API_URL ?? 'https://app.eraser.io/api/render';

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
          uri: `ui://eraser-diagram/${Date.now()}` as `ui://${string}`,
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
      },
    );

    this.server.tool('show_remote_dom_react', 'Shows a react remote-dom component', async () => {
      const resourceBlock = createUIResource({
        uri: `ui://remote-dom-react/${Date.now()}` as `ui://${string}`,
        encoding: 'text',
        content: {
          type: 'remoteDom',
          framework: 'react',
          script: `
            // Create a state variable to track the current logo
            let isDarkMode = false;

            // Create the main container stack with centered alignment
            const stack = document.createElement('ui-stack');
            stack.setAttribute('direction', 'vertical');
            stack.setAttribute('spacing', '20');
            stack.setAttribute('align', 'center');

            // Create the title text
            const title = document.createElement('ui-text');
            title.setAttribute('content', 'Logo Toggle Demo');

            // Create a centered container for the logo
            const logoContainer = document.createElement('ui-stack');
            logoContainer.setAttribute('direction', 'vertical');
            logoContainer.setAttribute('spacing', '0');
            logoContainer.setAttribute('align', 'center');

            // Create the logo image (starts with light theme)
            const logo = document.createElement('ui-image');
            logo.setAttribute('src', 'https://block.github.io/goose/img/logo_light.png');
            logo.setAttribute('alt', 'Goose Logo');
            logo.setAttribute('width', '200');

            // Create the toggle button
            const toggleButton = document.createElement('ui-button');
            toggleButton.setAttribute('label', '🌙 Switch to Dark Mode');

            // Add the toggle functionality
            toggleButton.addEventListener('press', () => {
              isDarkMode = !isDarkMode;
              
              if (isDarkMode) {
                // Switch to dark mode
                logo.setAttribute('src', 'https://block.github.io/goose/img/logo_dark.png');
                logo.setAttribute('alt', 'Goose Logo (Dark Mode)');
                toggleButton.setAttribute('label', '☀️ Switch to Light Mode');
              } else {
                // Switch to light mode
                logo.setAttribute('src', 'https://block.github.io/goose/img/logo_light.png');
                logo.setAttribute('alt', 'Goose Logo (Light Mode)');
                toggleButton.setAttribute('label', '🌙 Switch to Dark Mode');
              }
              
              console.log('Logo toggled to:', isDarkMode ? 'dark' : 'light', 'mode');
            });

            // Assemble the UI
            logoContainer.appendChild(logo);
            stack.appendChild(title);
            stack.appendChild(logoContainer);
            stack.appendChild(toggleButton);
            root.appendChild(stack);
          `,
        },
      });
      return {
        content: [resourceBlock],
      };
    });

    this.server.tool(
      'show_remote_dom_web_components',
      'Shows a web components remote-dom component',
      async () => {
        const resourceBlock = createUIResource({
          uri: `ui://remote-dom-wc/${Date.now()}` as `ui://${string}`,
          encoding: 'text',
          content: {
            type: 'remoteDom',
            framework: 'webcomponents',
            script: `
            // Create a state variable to track the current logo
            let isDarkMode = false;

            // Create the main container stack with centered alignment
            const stack = document.createElement('ui-stack');
            stack.setAttribute('direction', 'vertical');
            stack.setAttribute('spacing', '20');
            stack.setAttribute('align', 'center');

            // Create the title text
            const title = document.createElement('ui-text');
            title.setAttribute('content', 'Logo Toggle Demo');

            // Create a centered container for the logo
            const logoContainer = document.createElement('ui-stack');
            logoContainer.setAttribute('direction', 'vertical');
            logoContainer.setAttribute('spacing', '0');
            logoContainer.setAttribute('align', 'center');

            // Create the logo image (starts with light theme)
            const logo = document.createElement('ui-image');
            logo.setAttribute('src', 'https://block.github.io/goose/img/logo_light.png');
            logo.setAttribute('alt', 'Goose Logo');
            logo.setAttribute('width', '200');

            // Create the toggle button
            const toggleButton = document.createElement('ui-button');
            toggleButton.setAttribute('label', '🌙 Switch to Dark Mode');

            // Add the toggle functionality
            toggleButton.addEventListener('press', () => {
              isDarkMode = !isDarkMode;
              
              if (isDarkMode) {
                // Switch to dark mode
                logo.setAttribute('src', 'https://block.github.io/goose/img/logo_dark.png');
                logo.setAttribute('alt', 'Goose Logo (Dark Mode)');
                toggleButton.setAttribute('label', '☀️ Switch to Light Mode');
              } else {
                // Switch to light mode
                logo.setAttribute('src', 'https://block.github.io/goose/img/logo_light.png');
                logo.setAttribute('alt', 'Goose Logo (Light Mode)');
                toggleButton.setAttribute('label', '🌙 Switch to Dark Mode');
              }
              
              console.log('Logo toggled to:', isDarkMode ? 'dark' : 'light', 'mode');
            });

            // Assemble the UI
            logoContainer.appendChild(logo);
            stack.appendChild(title);
            stack.appendChild(logoContainer);
            stack.appendChild(toggleButton);
            root.appendChild(stack);
          `,
          },
        });
        return {
          content: [resourceBlock],
        };
      },
    );
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    const url = new URL(request.url);
    ctx.props.requestUrl = request.url;

    if (url.pathname === '/sse' || url.pathname === '/sse/message') {
      return MyMCP.serveSSE('/sse').fetch(request, env, ctx);
    }

    if (url.pathname === '/mcp') {
      return MyMCP.serve('/mcp').fetch(request, env, ctx);
    }

    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
    // return new Response("Not found", { status: 404 });
  },
};

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
