import type { ConversationService } from '../conversation/conversation.service.js';
import type { WhatsAppService } from '../whatsapp/whatsapp.service.js';

const HUMAN_REQUEST_PATTERNS = [
  /talk to a (person|human|agent|representative)/i,
  /speak to (someone|a human|an agent|a person)/i,
  /connect me to (a human|an agent|a person|someone)/i,
  /transfer to (agent|human|support)/i,
  /real person/i,
  /human agent/i,
];

interface HandoffDeps {
  conversationService: Pick<ConversationService, 'updateStatus'>;
  whatsappService: Pick<WhatsAppService, 'sendTextMessage'>;
  socketEmit: (event: string, data: unknown) => void;
}

export class HandoffService {
  constructor(private deps: HandoffDeps) {}

  shouldHandoff(aiResponse: string, userMessage: string): boolean {
    if (aiResponse.includes('[HANDOFF]')) {
      return true;
    }

    for (const pattern of HUMAN_REQUEST_PATTERNS) {
      if (pattern.test(userMessage)) {
        return true;
      }
    }

    return false;
  }

  async executeHandoff(conversationId: string, customerPhone: string): Promise<void> {
    await this.deps.conversationService.updateStatus(conversationId, 'human');

    await this.deps.whatsappService.sendTextMessage(
      customerPhone,
      "I'm connecting you with a team member who can better assist you. Please hold on a moment."
    );

    this.deps.socketEmit('handoff', { conversationId });
  }
}
