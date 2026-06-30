import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { AuthService } from './auth.service.js';
import { authRoutes, authMiddleware } from './auth.controller.js';
import { conversationsRoutes } from './conversations.controller.js';
import { knowledgeRoutes } from './knowledge.controller.js';
import { dashboardRoutes } from './dashboard.controller.js';
import type { ConversationService } from '../conversation/conversation.service.js';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import type { WhatsAppService } from '../whatsapp/whatsapp.service.js';
import type { SyncScheduler } from '../sync/sync.scheduler.js';

interface AdminPluginDeps {
  authService: AuthService;
  conversationService: ConversationService;
  knowledgeService: KnowledgeService;
  whatsappService: WhatsAppService;
  syncScheduler: SyncScheduler;
}

export default fp(async (app: FastifyInstance, deps: AdminPluginDeps) => {
  // Public route: login
  await app.register(authRoutes(deps.authService));

  // Protected routes: require JWT
  const middleware = authMiddleware(deps.authService);

  await app.register(async (protectedApp) => {
    protectedApp.addHook('onRequest', middleware);

    await protectedApp.register(conversationsRoutes({
      prisma: app.prisma,
      conversationService: deps.conversationService,
      whatsappService: deps.whatsappService,
    }));

    await protectedApp.register(knowledgeRoutes({
      knowledgeService: deps.knowledgeService,
      syncScheduler: deps.syncScheduler,
    }));

    await protectedApp.register(dashboardRoutes(app.prisma));
  });
});
