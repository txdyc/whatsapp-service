import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuthService } from './auth.service.js';

export function authRoutes(authService: AuthService) {
  return async function (app: FastifyInstance) {
    app.post('/admin/login', async (request: FastifyRequest, reply: FastifyReply) => {
      const { email, password } = request.body as { email: string; password: string };

      if (!email || !password) {
        return reply.code(400).send({ error: 'Email and password are required' });
      }

      const result = await authService.login(email, password);
      if (!result) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      return { token: result.token, agent: result.agent };
    });
  };
}

export function authMiddleware(authService: AuthService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    try {
      const token = authHeader.slice(7);
      const payload = authService.verifyToken(token);
      (request as any).agent = payload;
    } catch {
      return reply.code(401).send({ error: 'Invalid token' });
    }
  };
}
