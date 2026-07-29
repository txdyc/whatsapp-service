interface EmbeddingServiceDeps {
  apiKey: string;
  model: string;
  baseUrl?: string;
  post: (url: string, data: unknown, config: unknown) => Promise<any>;
}

export class EmbeddingService {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private post: EmbeddingServiceDeps['post'];

  constructor(deps: EmbeddingServiceDeps) {
    this.apiKey = deps.apiKey;
    this.model = deps.model;
    this.baseUrl = (deps.baseUrl ?? 'https://api.openai.com').replace(/\/+$/, '');
    this.post = deps.post;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.post(
      `${this.baseUrl}/v1/embeddings`,
      { input: text, model: this.model },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data.data[0].embedding;
  }
}
