import { FastifyInstance, FastifyRequest } from 'fastify';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import type { SyncScheduler } from '../sync/sync.scheduler.js';

interface KnowledgeControllerDeps {
  knowledgeService: KnowledgeService;
  syncScheduler: SyncScheduler;
}

export function knowledgeRoutes(deps: KnowledgeControllerDeps) {
  return async function (app: FastifyInstance) {
    app.get('/admin/knowledge', async (request: FastifyRequest) => {
      const { category } = request.query as { category?: string };
      const docs = await deps.knowledgeService.listDocs(category);
      return { docs };
    });

    app.post('/admin/knowledge', async (request: FastifyRequest) => {
      const body = request.body as {
        title: string;
        content: string;
        category: 'product' | 'faq' | 'policy';
      };

      await deps.knowledgeService.createDoc({
        title: body.title,
        content: body.content,
        category: body.category,
        source: 'manual',
      });

      return { success: true };
    });

    app.put('/admin/knowledge/:id', async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      const body = request.body as { title?: string; content?: string };
      await deps.knowledgeService.updateDoc(id, body);
      return { success: true };
    });

    app.delete('/admin/knowledge/:id', async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      await deps.knowledgeService.deleteDoc(id);
      return { success: true };
    });

    app.post('/admin/knowledge/sync', async () => {
      const result = await deps.syncScheduler.runNow();
      return result;
    });
  };
}
