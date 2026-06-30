import type { LLMMessage } from './llm.types.js';
import type { SessionMessage } from '../conversation/session.service.js';
import type { VectorSearchResult } from '../knowledge/knowledge.types.js';

interface PromptBuilderConfig {
  companyName: string;
  systemPromptOverride?: string;
}

export class PromptBuilder {
  private config: PromptBuilderConfig;

  constructor(config: PromptBuilderConfig) {
    this.config = config;
  }

  build(
    knowledgeContext: VectorSearchResult[],
    conversationHistory: SessionMessage[],
    userMessage: string
  ): LLMMessage[] {
    const messages: LLMMessage[] = [];

    const systemContent = this.buildSystemPrompt(knowledgeContext);
    messages.push({ role: 'system', content: systemContent });

    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    }

    messages.push({ role: 'user', content: userMessage });

    return messages;
  }

  private buildSystemPrompt(knowledgeContext: VectorSearchResult[]): string {
    if (this.config.systemPromptOverride) {
      const knowledgeSection = this.formatKnowledgeContext(knowledgeContext);
      return `${this.config.systemPromptOverride}\n\n${knowledgeSection}`;
    }

    const knowledgeSection = this.formatKnowledgeContext(knowledgeContext);

    return `You are the customer service assistant for ${this.config.companyName}.
Answer customer questions based on the product information and policies below.
If you cannot answer the question or the customer requests to speak to a human agent, output [HANDOFF] at the beginning of your response.
Maintain a friendly, professional tone. Reply in the same language the customer uses.

${knowledgeSection}`;
  }

  private formatKnowledgeContext(docs: VectorSearchResult[]): string {
    if (docs.length === 0) {
      return '--- Knowledge Base ---\nNo specific product information available for this query.';
    }

    const entries = docs
      .map((doc) => `### ${doc.title} (${doc.category})\n${doc.content}`)
      .join('\n\n');

    return `--- Knowledge Base ---\n${entries}`;
  }
}
