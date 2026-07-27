import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KnowledgeService } from '../../../src/modules/knowledge/knowledge.service.js';

describe('KnowledgeService', () => {
  let service: KnowledgeService;
  let mockPrisma: any;
  let mockEmbeddingService: any;

  beforeEach(() => {
    mockPrisma = {
      knowledgeDoc: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      $queryRawUnsafe: vi.fn(),
    };
    mockEmbeddingService = {
      embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
    };
    service = new KnowledgeService(mockPrisma, mockEmbeddingService);
  });

  describe('createDoc', () => {
    it('should create a knowledge doc with embedding', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ id: 'doc-1' }]);

      await service.createDoc({
        title: 'Test Product',
        content: 'A great product',
        category: 'product',
        source: 'manual',
      });

      expect(mockEmbeddingService.embed).toHaveBeenCalledWith('Test Product\n\nA great product');
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalled();
      const sqlCall = mockPrisma.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sqlCall).toContain('INSERT INTO knowledge_docs');
    });

    it('does not embed skill docs and stores a NULL embedding', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ id: 'skill-1' }]);

      await service.createDoc({
        title: 'Empathy first',
        content: 'Acknowledge the customer feelings before solving',
        category: 'skill',
        source: 'manual',
      });

      expect(mockEmbeddingService.embed).not.toHaveBeenCalled();
      const sqlCall = mockPrisma.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sqlCall).toContain('INSERT INTO knowledge_docs');
      expect(sqlCall).toContain('NULL');
      expect(sqlCall).not.toContain('::vector');
    });
  });

  describe('searchSimilar', () => {
    it('should search for similar documents using vector similarity', async () => {
      const mockResults = [
        { id: 'doc-1', title: 'Product A', content: 'Description A', category: 'product', similarity: 0.95 },
      ];
      mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResults);

      const results = await service.searchSimilar('I want a product', 5);

      expect(mockEmbeddingService.embed).toHaveBeenCalledWith('I want a product');
      expect(results).toEqual(mockResults);
      const sqlCall = mockPrisma.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sqlCall).toContain('1 - (embedding <=>');
    });
  });

  describe('getSkills', () => {
    it('returns all docs in the skill category', async () => {
      const skillDocs = [
        { id: 's1', title: 'Empathy first', content: 'Acknowledge feelings', category: 'skill', source: 'manual' },
      ];
      mockPrisma.knowledgeDoc.findMany.mockResolvedValue(skillDocs);

      const result = await service.getSkills();

      expect(mockPrisma.knowledgeDoc.findMany).toHaveBeenCalledWith({
        where: { category: 'skill' },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual(skillDocs);
    });
  });

  describe('searchSimilar excludes skills', () => {
    it('filters out skill-category docs from vector search', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.searchSimilar('anything', 5);

      const sqlCall = mockPrisma.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sqlCall).toContain("category != 'skill'");
    });
  });
});
