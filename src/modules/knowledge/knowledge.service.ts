import { PrismaClient, KnowledgeDoc } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import type { EmbeddingService } from './embedding.service.js';
import type { CreateKnowledgeDocInput, VectorSearchResult } from './knowledge.types.js';

export class KnowledgeService {
  constructor(
    private prisma: PrismaClient,
    private embeddingService: EmbeddingService
  ) {}

  async createDoc(input: CreateKnowledgeDocInput): Promise<void> {
    const embeddingText = `${input.title}\n\n${input.content}`;
    const embedding = await this.embeddingService.embed(embeddingText);
    const vectorStr = `[${embedding.join(',')}]`;
    const id = uuidv4();
    const metadata = JSON.stringify(input.metadata ?? {});

    await this.prisma.$queryRawUnsafe(
      `INSERT INTO knowledge_docs (id, title, content, category, source, metadata, embedding, created_at, updated_at)
       VALUES ($1, $2, $3, $4::"KnowledgeCategory", $5::"KnowledgeSource", $6::jsonb, $7::vector, NOW(), NOW())`,
      id,
      input.title,
      input.content,
      input.category,
      input.source,
      metadata,
      vectorStr
    );
  }

  async searchSimilar(query: string, topK: number = 5): Promise<VectorSearchResult[]> {
    const queryEmbedding = await this.embeddingService.embed(query);
    const vectorStr = `[${queryEmbedding.join(',')}]`;

    const results = await this.prisma.$queryRawUnsafe<VectorSearchResult[]>(
      `SELECT id, title, content, category,
              1 - (embedding <=> $1::vector) AS similarity
       FROM knowledge_docs
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      vectorStr,
      topK
    );

    return results;
  }

  async listDocs(category?: string): Promise<KnowledgeDoc[]> {
    return this.prisma.knowledgeDoc.findMany({
      where: category ? { category: category as any } : {},
      orderBy: { updatedAt: 'desc' },
    });
  }

  async deleteDoc(id: string): Promise<void> {
    await this.prisma.knowledgeDoc.delete({ where: { id } });
  }

  async updateDoc(id: string, input: Partial<CreateKnowledgeDocInput>): Promise<void> {
    if (input.title || input.content) {
      const existing = await this.prisma.knowledgeDoc.findUnique({ where: { id } });
      if (!existing) throw new Error(`Knowledge doc ${id} not found`);

      const title = input.title ?? existing.title;
      const content = input.content ?? existing.content;
      const embeddingText = `${title}\n\n${content}`;
      const embedding = await this.embeddingService.embed(embeddingText);
      const vectorStr = `[${embedding.join(',')}]`;

      await this.prisma.$queryRawUnsafe(
        `UPDATE knowledge_docs SET title = $2, content = $3, embedding = $4::vector, updated_at = NOW()
         WHERE id = $1`,
        id,
        title,
        content,
        vectorStr
      );
    } else {
      await this.prisma.knowledgeDoc.update({
        where: { id },
        data: { ...(input.metadata ? { metadata: input.metadata as any } : {}) },
      });
    }
  }
}
