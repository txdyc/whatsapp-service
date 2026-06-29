import Redis from 'ioredis';

export interface SessionMessage {
  role: 'user' | 'bot' | 'agent';
  content: string;
}

export class SessionService {
  private keyPrefix = 'session:';
  private ttlSeconds = 86400; // 24 hours

  constructor(
    private redis: Redis,
    private maxMessages: number = 20
  ) {}

  async addMessage(conversationId: string, message: SessionMessage): Promise<void> {
    const key = this.keyPrefix + conversationId;
    await this.redis.lpush(key, JSON.stringify(message));
    await this.redis.ltrim(key, 0, this.maxMessages - 1);
    await this.redis.expire(key, this.ttlSeconds);
  }

  async getMessages(conversationId: string): Promise<SessionMessage[]> {
    const key = this.keyPrefix + conversationId;
    const raw = await this.redis.lrange(key, 0, -1);
    // Stored newest-first (lpush), reverse to chronological
    return raw.map((s) => JSON.parse(s) as SessionMessage).reverse();
  }

  async clearSession(conversationId: string): Promise<void> {
    await this.redis.del(this.keyPrefix + conversationId);
  }
}
