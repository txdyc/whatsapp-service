import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionService } from '../../../src/modules/conversation/session.service.js';

describe('SessionService', () => {
  let service: SessionService;
  let mockRedis: any;

  beforeEach(() => {
    mockRedis = {
      lpush: vi.fn(),
      ltrim: vi.fn(),
      lrange: vi.fn(),
      expire: vi.fn(),
      del: vi.fn(),
    };
    service = new SessionService(mockRedis, 20);
  });

  describe('addMessage', () => {
    it('should push message to Redis list and trim to max length', async () => {
      const message = { role: 'user' as const, content: 'Hi there' };

      await service.addMessage('conv-1', message);

      expect(mockRedis.lpush).toHaveBeenCalledWith(
        'session:conv-1',
        JSON.stringify(message)
      );
      expect(mockRedis.ltrim).toHaveBeenCalledWith('session:conv-1', 0, 19);
      expect(mockRedis.expire).toHaveBeenCalledWith('session:conv-1', 86400);
    });
  });

  describe('getMessages', () => {
    it('should return messages in chronological order', async () => {
      mockRedis.lrange.mockResolvedValue([
        JSON.stringify({ role: 'bot', content: 'Hi!' }),
        JSON.stringify({ role: 'user', content: 'Hello' }),
      ]);

      const result = await service.getMessages('conv-1');
      expect(result).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'bot', content: 'Hi!' },
      ]);
    });
  });

  describe('clearSession', () => {
    it('should delete the session key', async () => {
      await service.clearSession('conv-1');
      expect(mockRedis.del).toHaveBeenCalledWith('session:conv-1');
    });
  });
});
