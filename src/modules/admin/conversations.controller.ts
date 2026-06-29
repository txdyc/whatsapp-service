import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { ConversationService } from '../conversation/conversation.service.js';
import type { WhatsAppService } from '../whatsapp/whatsapp.service.js';

interface ConversationsControllerDeps {
  prisma: PrismaClient;
  conversationService: ConversationService;
  whatsappService: WhatsAppService;
}

export function conversationsRoutes(deps: ConversationsControllerDeps) {
  return async function (app: FastifyInstance) {
    app.get('/admin/conversations', async (request: FastifyRequest) => {
      const query = request.query as { status?: string; page?: string; limit?: string };
      const page = parseInt(query.page ?? '1', 10);
      const limit = parseInt(query.limit ?? '20', 10);
      const skip = (page - 1) * limit;

      const where = query.status ? { status: query.status as any } : {};

      const [conversations, total] = await Promise.all([
        deps.prisma.conversation.findMany({
          where,
          include: { assignedAgent: { select: { id: true, name: true } } },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: limit,
        }),
        deps.prisma.conversation.count({ where }),
      ]);

      return { conversations, total, page, limit };
    });

    app.get('/admin/conversations/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const conversation = await deps.prisma.conversation.findUnique({
        where: { id },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          assignedAgent: { select: { id: true, name: true } },
        },
      });

      if (!conversation) {
        return reply.code(404).send({ error: 'Conversation not found' });
      }

      return conversation;
    });

    app.post('/admin/conversations/:id/reply', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { message } = request.body as { message: string };
      const agent = (request as any).agent;

      const conversation = await deps.prisma.conversation.findUnique({ where: { id } });
      if (!conversation) {
        return reply.code(404).send({ error: 'Conversation not found' });
      }
      if (conversation.status !== 'human') {
        return reply.code(400).send({ error: 'Conversation is not in human mode' });
      }

      await deps.whatsappService.sendTextMessage(conversation.contactPhone, message);
      await deps.conversationService.addMessage(id, 'agent', message);

      if (!conversation.assignedAgentId) {
        await deps.conversationService.updateStatus(id, 'human', agent.id);
      }

      return { success: true };
    });

    app.patch('/admin/conversations/:id/close', async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      await deps.conversationService.updateStatus(id, 'closed');
      return { success: true };
    });
  };
}
