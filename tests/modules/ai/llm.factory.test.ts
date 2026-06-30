import { describe, it, expect } from 'vitest';
import { createLLMProvider } from '../../../src/modules/ai/llm.factory.js';
import { ClaudeProvider } from '../../../src/modules/ai/providers/claude.provider.js';
import { OpenAIProvider } from '../../../src/modules/ai/providers/openai.provider.js';
import { DeepSeekProvider } from '../../../src/modules/ai/providers/deepseek.provider.js';

describe('createLLMProvider', () => {
  it('should create Claude provider', () => {
    const provider = createLLMProvider({ provider: 'claude', claudeApiKey: 'sk-test' });
    expect(provider).toBeInstanceOf(ClaudeProvider);
    expect(provider.name).toBe('claude');
  });

  it('should create OpenAI provider', () => {
    const provider = createLLMProvider({ provider: 'openai', openaiApiKey: 'sk-test' });
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider.name).toBe('openai');
  });

  it('should create DeepSeek provider', () => {
    const provider = createLLMProvider({ provider: 'deepseek', deepseekApiKey: 'sk-test' });
    expect(provider).toBeInstanceOf(DeepSeekProvider);
    expect(provider.name).toBe('deepseek');
  });

  it('should throw if API key is missing', () => {
    expect(() => createLLMProvider({ provider: 'claude' })).toThrow('CLAUDE_API_KEY is required');
  });

  it('should throw for unknown provider', () => {
    expect(() => createLLMProvider({ provider: 'unknown' as any })).toThrow('Unknown LLM provider');
  });
});
