import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { PrismaClient, Agent } from '@prisma/client';

interface TokenPayload {
  id: string;
  email: string;
  role: string;
}

export class AuthService {
  constructor(
    private prisma: PrismaClient,
    private jwtSecret: string
  ) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  generateToken(payload: TokenPayload): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn: '24h' });
  }

  verifyToken(token: string): TokenPayload {
    return jwt.verify(token, this.jwtSecret) as TokenPayload;
  }

  async login(email: string, password: string): Promise<{ token: string; agent: Omit<Agent, 'passwordHash'> } | null> {
    const agent = await this.prisma.agent.findUnique({ where: { email } });
    if (!agent || !agent.isActive) return null;

    const valid = await this.verifyPassword(password, agent.passwordHash);
    if (!valid) return null;

    const token = this.generateToken({ id: agent.id, email: agent.email, role: agent.role });
    const { passwordHash, ...agentWithoutPassword } = agent;
    return { token, agent: agentWithoutPassword };
  }

  async ensureDefaultAdmin(email: string, password: string): Promise<void> {
    const existing = await this.prisma.agent.findFirst({ where: { role: 'admin' } });
    if (existing) return;

    const passwordHash = await this.hashPassword(password);
    await this.prisma.agent.create({
      data: {
        name: 'Admin',
        email,
        passwordHash,
        role: 'admin',
        isActive: true,
      },
    });
  }
}
