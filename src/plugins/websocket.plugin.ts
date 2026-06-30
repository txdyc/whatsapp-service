import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const io = new Server(fastify.server, {
    cors: { origin: '*' },
    path: '/ws',
  });

  io.on('connection', (socket) => {
    fastify.log.info({ socketId: socket.id }, 'WebSocket client connected');

    socket.on('disconnect', () => {
      fastify.log.info({ socketId: socket.id }, 'WebSocket client disconnected');
    });
  });

  fastify.decorate('io', io);

  fastify.addHook('onClose', async () => {
    io.close();
  });
});
