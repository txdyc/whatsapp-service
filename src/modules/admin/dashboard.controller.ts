import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

export function dashboardRoutes(prisma: PrismaClient) {
  return async function (app: FastifyInstance) {
    app.get('/admin/dashboard', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        totalConversations,
        todayConversations,
        aiConversations,
        humanConversations,
        pendingHandoffs,
        totalMessages,
      ] = await Promise.all([
        prisma.conversation.count(),
        prisma.conversation.count({ where: { createdAt: { gte: today } } }),
        prisma.conversation.count({ where: { status: 'ai' } }),
        prisma.conversation.count({ where: { status: 'human' } }),
        prisma.conversation.count({ where: { status: 'human', assignedAgentId: null } }),
        prisma.message.count({ where: { createdAt: { gte: today } } }),
      ]);

      const aiResolutionRate = totalConversations > 0
        ? ((totalConversations - humanConversations) / totalConversations * 100).toFixed(1)
        : '0';

      return {
        totalConversations,
        todayConversations,
        activeAiConversations: aiConversations,
        activeHumanConversations: humanConversations,
        pendingHandoffs,
        todayMessages: totalMessages,
        aiResolutionRate: `${aiResolutionRate}%`,
      };
    });
  };
}
