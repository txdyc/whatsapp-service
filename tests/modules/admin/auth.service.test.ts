import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../../../src/modules/admin/auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      agent: {
        findUnique: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
      },
    };
    service = new AuthService(mockPrisma, 'test-jwt-secret');
  });

  describe('hashPassword', () => {
    it('should hash a password with bcrypt', async () => {
      const hash = await service.hashPassword('password123');
      expect(hash).not.toBe('password123');
      expect(hash.startsWith('$2')).toBe(true);
    });
  });

  describe('verifyPassword', () => {
    it('should return true for correct password', async () => {
      const hash = await service.hashPassword('password123');
      const result = await service.verifyPassword('password123', hash);
      expect(result).toBe(true);
    });

    it('should return false for wrong password', async () => {
      const hash = await service.hashPassword('password123');
      const result = await service.verifyPassword('wrong', hash);
      expect(result).toBe(false);
    });
  });

  describe('generateToken / verifyToken', () => {
    it('should generate and verify a JWT token', () => {
      const token = service.generateToken({ id: 'agent-1', email: 'test@test.com', role: 'admin' });
      expect(typeof token).toBe('string');

      const payload = service.verifyToken(token);
      expect(payload.id).toBe('agent-1');
      expect(payload.email).toBe('test@test.com');
      expect(payload.role).toBe('admin');
    });

    it('should throw for invalid token', () => {
      expect(() => service.verifyToken('invalid-token')).toThrow();
    });
  });
});
