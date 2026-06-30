import type { LLMProvider } from './llm.types.js';
import { ClaudeProvider } from './providers/claude.provider.js';
import { OpenAIProvider } from './providers/openai.provider.js';
import { DeepSeekProvider } from './providers/deepseek.provider.js';

export type LLMProviderName = 'claude' | 'openai' | 'deepseek';

interface LLMFactoryConfig {
  provider: LLMProviderName;
  claudeApiKey?: string;
  openaiApiKey?: string;
  deepseekApiKey?: string;
}

export function createLLMProvider(config: LLMFactoryConfig): LLMProvider {
  switch (config.provider) {
    case 'claude':
      if (!config.claudeApiKey) throw new Error('CLAUDE_API_KEY is required when LLM_PROVIDER=claude');
      return new ClaudeProvider(config.claudeApiKey);
    case 'openai':
      if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER=openai');
      return new OpenAIProvider(config.openaiApiKey);
    case 'deepseek':
      if (!config.deepseekApiKey) throw new Error('DEEPSEEK_API_KEY is required when LLM_PROVIDER=deepseek');
      return new DeepSeekProvider(config.deepseekApiKey);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}
