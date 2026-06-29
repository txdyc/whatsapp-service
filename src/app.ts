import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './config/index.js';
import { logger } from './common/logger.js';
import prismaPlugin from './plugins/prisma.plugin.js';
import redisPlugin from './plugins/redis.plugin.js';

export async function buildApp() {
  const config = loadConfig();

  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(prismaPlugin);
  await app.register(redisPlugin);

  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
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
