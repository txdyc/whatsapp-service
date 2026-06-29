import { describe, it, expect } from 'vitest';
import { parseWebhookMessages } from '../../../src/modules/whatsapp/webhook.controller.js';
import type { WebhookPayload, IncomingMessage } from '../../../src/modules/whatsapp/whatsapp.types.js';

describe('parseWebhookMessages', () => {
  it('should parse text messages from webhook payload', () => {
    const payload: WebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'entry-1',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '15551234567', phone_number_id: 'phone-1' },
            contacts: [{ profile: { name: 'John Doe' }, wa_id: '5511999999999' }],
            messages: [{
              from: '5511999999999',
              id: 'wamid.abc123',
              timestamp: '1700000000',
              type: 'text',
              text: { body: 'Hello, I want to buy a product' },
            }],
          },
          field: 'messages',
        }],
      }],
    };

    const result: IncomingMessage[] = parseWebhookMessages(payload);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      waMessageId: 'wamid.abc123',
      from: '5511999999999',
      contactName: 'John Doe',
      text: 'Hello, I want to buy a product',
      timestamp: '1700000000',
    });
  });

  it('should return empty array for status-only payloads', () => {
    const payload: WebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'entry-1',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '15551234567', phone_number_id: 'phone-1' },
            statuses: [{ id: 'wamid.xyz', status: 'delivered', timestamp: '1700000000', recipient_id: '5511999999999' }],
          },
          field: 'messages',
        }],
      }],
    };
    expect(parseWebhookMessages(payload)).toHaveLength(0);
  });

  it('should skip non-text messages', () => {
    const payload: WebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'entry-1',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '15551234567', phone_number_id: 'phone-1' },
            contacts: [{ profile: { name: 'John' }, wa_id: '5511999999999' }],
            messages: [{ from: '5511999999999', id: 'wamid.img', timestamp: '1700000000', type: 'image' }],
          },
          field: 'messages',
        }],
      }],
    };
    expect(parseWebhookMessages(payload)).toHaveLength(0);
  });
});
