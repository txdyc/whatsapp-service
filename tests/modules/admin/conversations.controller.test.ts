import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { conversationsRoutes } from '../../../src/modules/admin/conversations.controller.js';

describe('conversationsRoutes — agent reply', () => {
  it('emits new_message after saving an agent reply', async () => {
    const socketEmit = vi.fn();
    const deps = {
      prisma: {
        conversation: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'conv-1',
            status: 'human',
            contactPhone: '+1234567890',
            assignedAgentId: 'agent-1',
          }),
        },
      },
      conversationService: {
        addMessage: vi.fn().mockResolvedValue({ id: 'm1' }),
        updateStatus: vi.fn(),
      },
      whatsappService: { sendTextMessage: vi.fn().mockResolvedValue(undefined) },
      socketEmit,
    };

    const app = Fastify();
    await app.register(conversationsRoutes(deps as any));

    const res = await app.inject({
      method: 'POST',
      url: '/admin/conversations/conv-1/reply',
      payload: { message: 'Hello from the agent' },
    });

    expect(res.statusCode).toBe(200);
    expect(deps.whatsappService.sendTextMessage).toHaveBeenCalledWith('+1234567890', 'Hello from the agent');
    expect(deps.conversationService.addMessage).toHaveBeenCalledWith('conv-1', 'agent', 'Hello from the agent');
    expect(socketEmit).toHaveBeenCalledWith('new_message', {
      conversationId: 'conv-1',
      message: { role: 'agent', content: 'Hello from the agent' },
    });

    await app.close();
  });
});
