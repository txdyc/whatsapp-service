import { describe, it, expect } from 'vitest';
import { PromptBuilder } from '../../../src/modules/ai/prompt.builder.js';
import type { LLMMessage } from '../../../src/modules/ai/llm.types.js';
import type { SessionMessage } from '../../../src/modules/conversation/session.service.js';
import type { VectorSearchResult } from '../../../src/modules/knowledge/knowledge.types.js';

describe('PromptBuilder', () => {
  const builder = new PromptBuilder({
    companyName: 'TestShop',
    systemPromptOverride: undefined,
  });

  it('should build messages array with system prompt, knowledge context, history, and user message', () => {
    const knowledgeContext: VectorSearchResult[] = [
      { id: '1', title: 'Widget', content: 'A premium widget, $29.99', category: 'product', similarity: 0.9 },
    ];
    const history: SessionMessage[] = [
      { role: 'user', content: 'Hi' },
      { role: 'bot', content: 'Hello! How can I help?' },
    ];
    const result: LLMMessage[] = builder.build(knowledgeContext, [], history, 'Tell me about widgets');

    expect(result).toHaveLength(4);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('TestShop');
    expect(result[0].content).toContain('[HANDOFF]');
    expect(result[0].content).toContain('Widget');
    expect(result[0].content).toContain('$29.99');
    expect(result[1]).toEqual({ role: 'user', content: 'Hi' });
    expect(result[2]).toEqual({ role: 'assistant', content: 'Hello! How can I help?' });
    expect(result[3]).toEqual({ role: 'user', content: 'Tell me about widgets' });
  });

  it('should handle empty knowledge context', () => {
    const result = builder.build([], [], [], 'Hi');
    expect(result).toHaveLength(2);
    expect(result[0].content).toContain('No specific product information available');
  });

  it('should allow system prompt override', () => {
    const custom = new PromptBuilder({
      companyName: 'TestShop',
      systemPromptOverride: 'You are a pirate assistant.',
    });
    const result = custom.build([], [], [], 'Ahoy');
    expect(result[0].content).toContain('You are a pirate assistant.');
  });

  it('injects a customer-service techniques section when skills are provided', () => {
    const skills = [{ title: 'Handling price objections', content: 'Reaffirm value before discounting.' }];
    const result = builder.build([], skills, [], 'This is expensive');

    expect(result[0].content).toContain('Customer Service Techniques');
    expect(result[0].content).toContain('Handling price objections');
    expect(result[0].content).toContain('Reaffirm value before discounting.');
  });

  it('omits the techniques section when there are no skills', () => {
    const result = builder.build([], [], [], 'Hi');
    expect(result[0].content).not.toContain('Customer Service Techniques');
  });
});
