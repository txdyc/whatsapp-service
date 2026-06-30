import axios from 'axios';
import type { LLMProvider, LLMMessage, LLMCompletionResult } from '../llm.types.js';

export class DeepSeekProvider implements LLMProvider {
  name = 'deepseek';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'deepseek-chat') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async complete(messages: LLMMessage[]): Promise<LLMCompletionResult> {
    const response = await axios.post(
      'https://api.deepseek.com/chat/completions',
      {
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: 1024,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = response.data;
    return {
      content: data.choices[0].message.content,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
    };
  }
}
