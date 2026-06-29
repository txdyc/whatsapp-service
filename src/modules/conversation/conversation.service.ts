import { PrismaClient, Conversation, Message, ConversationStatus, MessageRole } from '@prisma/client';

export class ConversationService {
  constructor(private prisma: PrismaClient) {}

  async findOrCreateConversation(
    waContactId: string,
    contactName: string,
    contactPhone: string
  ): Promise<Conversation> {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        waContactId,
        status: { not: 'closed' },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        waContactId,
        contactName,
        contactPhone,
        status: 'ai',
      },
    });
  }

  async addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    waMessageId?: string
  ): Promise<Message> {
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        waMessageId: waMessageId ?? null,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  async getRecentMessages(conversationId: string, limit: number = 20): Promise<Message[]> {
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async updateStatus(conversationId: string, status: ConversationStatus, assignedAgentId?: string): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { status, ...(assignedAgentId ? { assignedAgentId } : {}) },
    });
  }

  async getConversationById(id: string): Promise<Conversation | null> {
    return this.prisma.conversation.findUnique({ where: { id } });
  }
}
