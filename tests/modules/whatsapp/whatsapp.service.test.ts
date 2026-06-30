import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppService } from '../../../src/modules/whatsapp/whatsapp.service.js';
import crypto from 'node:crypto';

describe('WhatsAppService', () => {
  let service: WhatsAppService;
  let mockPost: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockPost = vi.fn().mockResolvedValue({ status: 200, data: { messages: [{ id: 'wamid.123' }] } });
    service = new WhatsAppService({
      apiToken: 'test-token',
      phoneNumberId: '123456',
      post: mockPost,
    });
  });

  describe('sendTextMessage', () => {
    it('should send a text message via WhatsApp Cloud API', async () => {
      await service.sendTextMessage('5511999999999', 'Hello!');

      expect(mockPost).toHaveBeenCalledWith(
        'https://graph.facebook.com/v21.0/123456/messages',
        {
          messaging_product: 'whatsapp',
          to: '5511999999999',
          type: 'text',
          text: { body: 'Hello!' },
        },
        {
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        }
      );
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should return true for valid HMAC signature', () => {
      const validSig = 'sha256=' + crypto.createHmac('sha256', 'test-secret').update('test-body').digest('hex');
      const result = WhatsAppService.verifySignature('test-secret', 'test-body', validSig);
      expect(result).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const result = WhatsAppService.verifySignature('test-secret', 'test-body', 'sha256=0000000000000000000000000000000000000000000000000000000000000000');
      expect(result).toBe(false);
    });
  });
});
