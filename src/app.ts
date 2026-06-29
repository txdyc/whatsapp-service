import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './config/index.js';
import { logger } from './common/logger.js';
import prismaPlugin from './plugins/prisma.plugin.js';
import redisPlugin from './plugins/redis.plugin.js';
import websocketPlugin from './plugins/websocket.plugin.js';
import { parseWebhookMessages } from './modules/whatsapp/webhook.controller.js';
import { WhatsAppService } from './modules/whatsapp/whatsapp.service.js';
import { ConversationService } from './modules/conversation/conversation.service.js';
import { SessionService } from './modules/conversation/session.service.js';
import { createLLMProvider } from './modules/ai/llm.factory.js';
import { PromptBuilder } from './modules/ai/prompt.builder.js';
import { EmbeddingService } from './modules/knowledge/embedding.service.js';
import { KnowledgeService } from './modules/knowledge/knowledge.service.js';
import { HandoffService } from './modules/handoff/handoff.service.js';
import { MessagePipeline } from './modules/pipeline/message.pipeline.js';
import { WooCommerceClient } from './modules/sync/woocommerce.client.js';
import { SyncService } from './modules/sync/sync.service.js';
import { SyncScheduler } from './modules/sync/sync.scheduler.js';
import { AuthService } from './modules/admin/auth.service.js';
import adminPlugin from './modules/admin/admin.plugin.js';
import axios from 'axios';
import type { WebhookPayload } from './modules/whatsapp/whatsapp.types.js';

export async function buildApp() {
  const config = loadConfig();

  const app = Fastify({ logger: true });

  // Raw body parsing for webhook signature verification
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      const json = JSON.parse(body as string);
      (req as any).rawBody = body;
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Plugins
  await app.register(cors, { origin: true });
  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(websocketPlugin);

  // Services
  const whatsappService = new WhatsAppService({
    apiToken: config.WHATSAPP_API_TOKEN,
    phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
    post: axios.post as (url: string, data: unknown, config: unknown) => Promise<unknown>,
  });

  const conversationService = new ConversationService(app.prisma);
  const sessionService = new SessionService(app.redis);

  const llmProvider = createLLMProvider({
    provider: config.LLM_PROVIDER,
    claudeApiKey: config.CLAUDE_API_KEY,
    openaiApiKey: config.OPENAI_API_KEY,
    deepseekApiKey: config.DEEPSEEK_API_KEY,
  });

  const promptBuilder = new PromptBuilder({
    companyName: 'Our Store',
  });

  const embeddingService = new EmbeddingService({
    apiKey: config.EMBEDDING_API_KEY,
    model: config.EMBEDDING_MODEL,
    post: axios.post as (url: string, data: unknown, config: unknown) => Promise<any>,
  });

  const knowledgeService = new KnowledgeService(app.prisma, embeddingService);

  const handoffService = new HandoffService({
    conversationService,
    whatsappService,
    socketEmit: (event, data) => app.io.emit(event, data),
  });

  const pipeline = new MessagePipeline({
    conversationService,
    sessionService,
    knowledgeService,
    llmProvider,
    promptBuilder,
    whatsappService,
    handoffService,
  });

  const wooClient = new WooCommerceClient({
    url: config.WOOCOMMERCE_URL,
    consumerKey: config.WOOCOMMERCE_CONSUMER_KEY,
    consumerSecret: config.WOOCOMMERCE_CONSUMER_SECRET,
  });

  const syncService = new SyncService({
    wooClient,
    knowledgeService,
    prisma: app.prisma,
  });

  const syncScheduler = new SyncScheduler(syncService, config.WOOCOMMERCE_SYNC_INTERVAL_HOURS);

  const authService = new AuthService(app.prisma, config.ADMIN_JWT_SECRET);

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // WhatsApp webhook
  app.get('/webhook', async (request, reply) => {
    const query = request.query as Record<string, string>;
    if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === config.WHATSAPP_VERIFY_TOKEN) {
      return reply.code(200).send(query['hub.challenge']);
    }
    return reply.code(403).send('Forbidden');
  });

  app.post('/webhook', async (request, reply) => {
    const signature = request.headers['x-hub-signature-256'] as string | undefined;
    if (!signature) return reply.code(401).send('Missing signature');

    const rawBody = (request as any).rawBody as string;
    if (!WhatsAppService.verifySignature(config.WHATSAPP_APP_SECRET, rawBody, signature)) {
      return reply.code(401).send('Invalid signature');
    }

    const payload = request.body as WebhookPayload;
    const messages = parseWebhookMessages(payload);

    // Process each message asynchronously (don't block webhook response)
    for (const msg of messages) {
      pipeline.process(msg).catch((err) => {
        app.log.error({ err, messageId: msg.waMessageId }, 'Pipeline processing failed');
      });
    }

    return reply.code(200).send('OK');
  });

  // Admin routes
  await app.register(adminPlugin, {
    authService,
    conversationService,
    knowledgeService,
    whatsappService,
    syncScheduler,
  } as any);

  // Lifecycle hooks
  app.addHook('onReady', async () => {
    await authService.ensureDefaultAdmin(config.ADMIN_DEFAULT_EMAIL, config.ADMIN_DEFAULT_PASSWORD);
    syncScheduler.start();
  });

  app.addHook('onClose', async () => {
    syncScheduler.stop();
  });

  return app;
}

async function start() {
  const app = await buildApp();
  const config = loadConfig();
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}

start().catch((err) => {
  logger.error(err, 'Failed to start server');
  process.exit(1);
});
