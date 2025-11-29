export type ModelProvider = 'openai' | 'deepseek' | 'qwen';

export type AgentRole = 'planner' | 'reviewer' | 'generator';

export interface AgentStage {
  /** Unique stage identifier shown in logs or error messages. */
  id: string;
  /** Human-friendly label for documentation or UI. */
  label: string;
  /** Provider determines default base URL and any provider-specific nuances. */
  provider: ModelProvider;
  /** Model name to request from the provider (supports coding-specialized models). */
  model: string;
  /**
   * Environment variable that contains the API key for this provider.
   * Local/self-hosted models can omit this to perform keyless requests.
   */
  apiKeyEnv?: string;
  /** Optional environment variable that overrides the provider base URL. */
  baseUrlEnv?: string;
  /** Stage intent determines how the server builds prompts across the chain. */
  role: AgentRole;
  /** Optional per-stage max token override. */
  maxTokens?: number;
  /** Optional per-stage temperature override. */
  temperature?: number;
  /** Optional per-stage request timeout in milliseconds. */
  requestTimeoutMs?: number;
}

export interface ModelChain {
  /** Public identifier for selecting the chain. */
  name: string;
  /** Short description of what the chain is optimized for. */
  description?: string;
  /** Ordered list of agents that will process the request. */
  stages: AgentStage[];
}

/**
 * Default chain combines planning, review, and final HTML generation with
 * heterogeneous models. Update this file to swap providers or add more stages
 * without touching the server logic.
 */
export const modelChains: Record<string, ModelChain> = {
  default: {
    name: 'design-review-generate',
    description: 'Planner + reviewer + coder models for robust HTML synthesis.',
    stages: [
      {
        id: 'planner',
        label: 'Layout planner',
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKeyEnv: 'OPENAI_API_KEY',
        role: 'planner',
        maxTokens: 16000,
        temperature: 0.3,
      },
      {
        id: 'reviewer',
        label: 'Critique and accessibility review',
        provider: 'qwen',
        model: 'qwen3:30b',
        apiKeyEnv: '',
        baseUrlEnv: '',
        role: 'reviewer',
        maxTokens: 32000,
        temperature: 0.2,
      },
      {
        id: 'coder',
        label: 'HTML generator (coding-optimized)',
        provider: 'qwen',
        model: 'qwen3-coder:30b',
        apiKeyEnv: '',
        baseUrlEnv: '',
        role: 'generator',
        maxTokens: 90000,
        temperature: 0.45,
      },
    ],
  },
};

function shouldDisableReviewer() {
  const raw = process.env.DISABLE_REVIEWER_STAGE;
  if (!raw) return false;

  const normalized = raw.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

export function getModelChain(chainName?: string): ModelChain {
  const selected = chainName ? modelChains[chainName] : undefined;
  const chain = selected ?? modelChains.default;

  if (!shouldDisableReviewer()) {
    return chain;
  }

  return {
    ...chain,
    stages: chain.stages.filter((stage) => stage.role !== 'reviewer'),
  };
}
