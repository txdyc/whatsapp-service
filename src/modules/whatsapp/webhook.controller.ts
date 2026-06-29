import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { WhatsAppService } from './whatsapp.service.js';
import type { WebhookPayload, IncomingMessage } from './whatsapp.types.js';
import { getConfig } from '../../config/index.js';

export function parseWebhookMessages(payload: WebhookPayload): IncomingMessage[] {
  const messages: IncomingMessage[] = [];

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const value = change.value;
      if (!value.messages) continue;

      const contactMap = new Map(
        (value.contacts ?? []).map((c) => [c.wa_id, c.profile.name])
      );

      for (const msg of value.messages) {
        if (msg.type !== 'text' || !msg.text) continue;
        messages.push({
          waMessageId: msg.id,
          from: msg.from,
          contactName: contactMap.get(msg.from) ?? msg.from,
          text: msg.text.body,
          timestamp: msg.timestamp,
        });
      }
    }
  }

  return messages;
}

export async function webhookRoutes(app: FastifyInstance) {
  const config = getConfig();

  // GET /webhook — Meta verification challenge
  app.get('/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === config.WHATSAPP_VERIFY_TOKEN) {
      return reply.code(200).send(challenge);
    }
    return reply.code(403).send('Forbidden');
  });

  // POST /webhook — receive messages
  app.post('/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    const signature = request.headers['x-hub-signature-256'] as string | undefined;
    if (!signature) {
      return reply.code(401).send('Missing signature');
    }

    const rawBody = (request as any).rawBody as string;
    if (!WhatsAppService.verifySignature(config.WHATSAPP_APP_SECRET, rawBody, signature)) {
      return reply.code(401).send('Invalid signature');
    }

    const payload = request.body as WebhookPayload;
    const incomingMessages = parseWebhookMessages(payload);

    // Messages will be processed by the pipeline (Task 8)
    // For now, just acknowledge
    for (const msg of incomingMessages) {
      app.log.info({ from: msg.from, text: msg.text }, 'Received WhatsApp message');
    }

    return reply.code(200).send('OK');
  });
}
