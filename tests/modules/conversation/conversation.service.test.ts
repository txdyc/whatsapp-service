import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationService } from '../../../src/modules/conversation/conversation.service.js';

describe('ConversationService', () => {
  let service: ConversationService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      conversation: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      message: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
    };
    service = new ConversationService(mockPrisma);
  });

  describe('findOrCreateConversation', () => {
    it('should return existing open conversation for a contact', async () => {
      const existing = { id: 'conv-1', waContactId: 'wa-123', status: 'ai' };
      mockPrisma.conversation.findFirst.mockResolvedValue(existing);

      const result = await service.findOrCreateConversation('wa-123', 'John', '+1234567890');
      expect(result).toEqual(existing);
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    });

    it('should create new conversation if none open', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);
      const created = { id: 'conv-2', waContactId: 'wa-123', status: 'ai' };
      mockPrisma.conversation.create.mockResolvedValue(created);

      const result = await service.findOrCreateConversation('wa-123', 'John', '+1234567890');
      expect(result).toEqual(created);
      expect(mockPrisma.conversation.create).toHaveBeenCalledWith({
        data: {
          waContactId: 'wa-123',
          contactName: 'John',
          contactPhone: '+1234567890',
          status: 'ai',
        },
      });
    });
  });

  describe('addMessage', () => {
    it('should create a message and update conversation timestamp', async () => {
      const msg = { id: 'msg-1', conversationId: 'conv-1', role: 'user', content: 'Hello' };
      mockPrisma.message.create.mockResolvedValue(msg);
      mockPrisma.conversation.update.mockResolvedValue({});

      const result = await service.addMessage('conv-1', 'user', 'Hello', 'wamid.123');
      expect(result).toEqual(msg);
      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv-1',
          role: 'user',
          content: 'Hello',
          waMessageId: 'wamid.123',
        },
      });
    });
  });

  describe('getRecentMessages', () => {
    it('should return last N messages for a conversation', async () => {
      const messages = [
        { id: 'msg-1', role: 'user', content: 'Hi' },
        { id: 'msg-2', role: 'bot', content: 'Hello!' },
      ];
      mockPrisma.message.findMany.mockResolvedValue(messages);

      const result = await service.getRecentMessages('conv-1', 10);
      expect(result).toEqual(messages);
      expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
        where: { conversationId: 'conv-1' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
    });
  });

  describe('updateStatus', () => {
    it('should update conversation status', async () => {
      mockPrisma.conversation.update.mockResolvedValue({ id: 'conv-1', status: 'human' });

      await service.updateStatus('conv-1', 'human');
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { status: 'human' },
      });
    });
  });
});
