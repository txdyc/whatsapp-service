import fp from 'fastify-plugin';
import Redis from 'ioredis';
import { FastifyInstance } from 'fastify';
import { getConfig } from '../config/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const config = getConfig();
  const redis = new Redis(config.REDIS_URL);

  fastify.decorate('redis', redis);

  fastify.addHook('onClose', async () => {
    await redis.quit();
  });
});
