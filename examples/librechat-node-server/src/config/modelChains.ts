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
  /** Environment variable that contains the API key for this provider. */
  apiKeyEnv: string;
  /** Optional environment variable that overrides the provider base URL. */
  baseUrlEnv?: string;
  /** Stage intent determines how the server builds prompts across the chain. */
  role: AgentRole;
  /** Optional per-stage max token override. */
  maxTokens?: number;
  /** Optional per-stage temperature override. */
  temperature?: number;
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
        maxTokens: 400,
        temperature: 0.3,
      },
      {
        id: 'reviewer',
        label: 'Critique and accessibility review',
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKeyEnv: 'DEEPSEEK_API_KEY',
        baseUrlEnv: 'DEEPSEEK_BASE_URL',
        role: 'reviewer',
        maxTokens: 320,
        temperature: 0.2,
      },
      {
        id: 'coder',
        label: 'HTML generator (coding-optimized)',
        provider: 'qwen',
        model: 'qwen2.5-coder',
        apiKeyEnv: 'QWEN_API_KEY',
        baseUrlEnv: 'QWEN_BASE_URL',
        role: 'generator',
        maxTokens: 900,
        temperature: 0.45,
      },
    ],
  },
};

export function getModelChain(chainName?: string): ModelChain {
  const selected = chainName && modelChains[chainName];
  return selected ?? modelChains.default;
}
