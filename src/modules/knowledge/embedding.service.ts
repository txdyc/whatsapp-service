interface EmbeddingServiceDeps {
  apiKey: string;
  model: string;
  post: (url: string, data: unknown, config: unknown) => Promise<any>;
}

export class EmbeddingService {
  private apiKey: string;
  private model: string;
  private post: EmbeddingServiceDeps['post'];

  constructor(deps: EmbeddingServiceDeps) {
    this.apiKey = deps.apiKey;
    this.model = deps.model;
    this.post = deps.post;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.post(
      'https://api.openai.com/v1/embeddings',
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
