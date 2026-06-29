import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingService } from '../../../src/modules/knowledge/embedding.service.js';

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let mockPost: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockPost = vi.fn().mockResolvedValue({
      data: {
        data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 5, total_tokens: 5 },
      },
    });
    service = new EmbeddingService({
      apiKey: 'test-key',
      model: 'text-embedding-3-small',
      post: mockPost,
    });
  });

  it('should generate embedding for text', async () => {
    const result = await service.embed('Hello world');
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(mockPost).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      { input: 'Hello world', model: 'text-embedding-3-small' },
      { headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' } }
    );
  });
});
