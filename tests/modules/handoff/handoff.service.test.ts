import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HandoffService } from '../../../src/modules/handoff/handoff.service.js';

describe('HandoffService', () => {
  let service: HandoffService;
  let deps: any;

  beforeEach(() => {
    deps = {
      conversationService: { updateStatus: vi.fn() },
      whatsappService: { sendTextMessage: vi.fn() },
      socketEmit: vi.fn(),
    };
    service = new HandoffService(deps);
  });

  describe('shouldHandoff', () => {
    it('should return true if AI response starts with [HANDOFF]', () => {
      expect(service.shouldHandoff('[HANDOFF] I cannot help with this.', 'I want a refund')).toBe(true);
    });

    it('should return true if AI response contains [HANDOFF] anywhere', () => {
      expect(service.shouldHandoff('Let me help. [HANDOFF]', 'complex issue')).toBe(true);
    });

    it('should return false for normal AI responses', () => {
      expect(service.shouldHandoff('Here is your product info!', 'Tell me about X')).toBe(false);
    });

    it('should return true if user explicitly requests human agent', () => {
      expect(service.shouldHandoff('Sure, I can help!', 'let me talk to a person')).toBe(true);
      expect(service.shouldHandoff('Sure!', 'I want to speak to someone')).toBe(true);
      expect(service.shouldHandoff('Sure!', 'connect me to a human')).toBe(true);
      expect(service.shouldHandoff('Sure!', 'transfer to agent')).toBe(true);
    });
  });

  describe('executeHandoff', () => {
    it('should update status, send WhatsApp message, and emit socket event', async () => {
      await service.executeHandoff('conv-1', '+1234567890');

      expect(deps.conversationService.updateStatus).toHaveBeenCalledWith('conv-1', 'human');
      expect(deps.whatsappService.sendTextMessage).toHaveBeenCalledWith(
        '+1234567890',
        expect.stringContaining('connecting you')
      );
      expect(deps.socketEmit).toHaveBeenCalledWith('handoff', { conversationId: 'conv-1' });
    });
  });
});
