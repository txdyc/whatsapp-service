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
    skills: Array<{ title: string; content: string }>,
    conversationHistory: SessionMessage[],
    userMessage: string
  ): LLMMessage[] {
    const messages: LLMMessage[] = [];

    const systemContent = this.buildSystemPrompt(knowledgeContext, skills);
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

  private buildSystemPrompt(
    knowledgeContext: VectorSearchResult[],
    skills: Array<{ title: string; content: string }>
  ): string {
    const base =
      this.config.systemPromptOverride ??
      `You are the customer service assistant for ${this.config.companyName}.`;
    const skillsSection = this.formatSkills(skills);
    const knowledgeSection = this.formatKnowledgeContext(knowledgeContext);

    return `${base}${skillsSection}

${knowledgeSection}

--- Rules ---
- Only state facts supported by the Knowledge Base above. Never invent prices, policies, stock, or delivery details.
- If you cannot answer the question or the customer requests a human agent, output [HANDOFF] at the beginning of your response.
- Maintain a friendly, professional tone. Reply in the same language the customer uses.`;
  }

  private formatSkills(skills: Array<{ title: string; content: string }>): string {
    if (skills.length === 0) return '';
    const entries = skills.map((s) => `### ${s.title}\n${s.content}`).join('\n\n');
    return `\n\n--- Customer Service Techniques (how to communicate) ---
Apply these techniques where they fit the situation. They guide HOW you respond, not the facts you state:
${entries}`;
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
