# WhatsApp AI Customer Service — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend for a WhatsApp AI customer service system that receives messages via WhatsApp Cloud API, generates intelligent replies using LLM + RAG, and supports human agent handoff.

**Architecture:** Node.js + TypeScript monolith using Fastify. PostgreSQL with pgvector for relational + vector data. Redis for session caching. Abstracted LLM layer supporting Claude, OpenAI, and DeepSeek. WooCommerce product sync via cron.

**Tech Stack:** Node.js 20+, TypeScript, Fastify, Prisma, PostgreSQL + pgvector, Redis, Socket.io, node-cron

**Spec:** `docs/superpowers/specs/2026-06-29-whatsapp-ai-customer-service-design.md`

**Scope:** This plan covers the backend only (`src/`, Docker, tests). The React admin dashboard frontend (`web/`) will be a separate plan.

---

## File Structure

```
whatsapp-service/
├── src/
│   ├── config/
│   │   └── index.ts                    # Env config with zod validation
│   ├── common/
│   │   ├── types.ts                    # Shared types & enums
│   │   ├── errors.ts                   # Custom error classes
│   │   └── logger.ts                   # Pino logger setup
│   ├── plugins/
│   │   ├── prisma.plugin.ts            # Fastify plugin: Prisma client
│   │   ├── redis.plugin.ts             # Fastify plugin: Redis (ioredis)
│   │   └── websocket.plugin.ts         # Fastify plugin: Socket.io
│   ├── modules/
│   │   ├── whatsapp/
│   │   │   ├── whatsapp.types.ts       # Webhook payload types
│   │   │   ├── whatsapp.service.ts     # Send messages via Cloud API
│   │   │   └── webhook.controller.ts   # GET verify + POST receive
│   │   ├── conversation/
│   │   │   ├── conversation.service.ts # Conversation CRUD + status
│   │   │   └── session.service.ts      # Redis session cache (recent messages)
│   │   ├── ai/
│   │   │   ├── llm.types.ts            # LLM provider interface
│   │   │   ├── providers/
│   │   │   │   ├── claude.provider.ts
│   │   │   │   ├── openai.provider.ts
│   │   │   │   └── deepseek.provider.ts
│   │   │   ├── llm.factory.ts          # Provider factory (create by config)
│   │   │   └── prompt.builder.ts       # Build system + context + history prompt
│   │   ├── knowledge/
│   │   │   ├── embedding.service.ts    # Generate embeddings via API
│   │   │   ├── knowledge.service.ts    # CRUD + vector similarity search
│   │   │   └── knowledge.types.ts      # Knowledge doc types
│   │   ├── handoff/
│   │   │   └── handoff.service.ts      # Detect handoff triggers, transition state
│   │   ├── sync/
│   │   │   ├── woocommerce.client.ts   # WooCommerce REST API wrapper
│   │   │   ├── sync.service.ts         # Sync orchestration (fetch → embed → store)
│   │   │   └── sync.scheduler.ts       # node-cron scheduling
│   │   ├── pipeline/
│   │   │   └── message.pipeline.ts     # Core: receive msg → RAG → LLM → reply
│   │   └── admin/
│   │       ├── auth.service.ts         # JWT sign/verify, password hashing
│   │       ├── auth.controller.ts      # POST /admin/login
│   │       ├── conversations.controller.ts  # GET/PATCH conversations
│   │       ├── knowledge.controller.ts      # CRUD knowledge docs
│   │       ├── dashboard.controller.ts      # GET analytics
│   │       └── admin.plugin.ts              # Register all admin routes
│   └── app.ts                          # Fastify app bootstrap
├── tests/
│   ├── modules/
│   │   ├── whatsapp/
│   │   │   ├── whatsapp.service.test.ts
│   │   │   └── webhook.controller.test.ts
│   │   ├── conversation/
│   │   │   ├── conversation.service.test.ts
│   │   │   └── session.service.test.ts
│   │   ├── ai/
│   │   │   ├── llm.factory.test.ts
│   │   │   └── prompt.builder.test.ts
│   │   ├── knowledge/
│   │   │   ├── embedding.service.test.ts
│   │   │   └── knowledge.service.test.ts
│   │   ├── handoff/
│   │   │   └── handoff.service.test.ts
│   │   ├── sync/
│   │   │   └── sync.service.test.ts
│   │   ├── pipeline/
│   │   │   └── message.pipeline.test.ts
│   │   └── admin/
│   │       ├── auth.service.test.ts
│   │       └── auth.controller.test.ts
│   └── helpers/
│       └── setup.ts                    # Test utilities, mocks, fixtures
├── prisma/
│   └── schema.prisma
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
├── .env.example
└── vitest.config.ts
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `docker-compose.yml`
- Create: `src/app.ts`
- Create: `vitest.config.ts`

- [ ] **Step 1: Initialize npm project and install dependencies**

```bash
npm init -y
npm install fastify @fastify/cors @fastify/jwt ioredis @prisma/client axios zod pino bcrypt socket.io node-cron uuid
npm install -D typescript @types/node @types/bcrypt @types/node-cron @types/uuid vitest prisma tsx
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create .env.example**

```env
# WhatsApp Cloud API
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=your_verify_token
WHATSAPP_APP_SECRET=

# LLM Configuration
LLM_PROVIDER=openai
CLAUDE_API_KEY=
OPENAI_API_KEY=
DEEPSEEK_API_KEY=

# Embedding
EMBEDDING_API_KEY=
EMBEDDING_MODEL=text-embedding-3-small

# WooCommerce
WOOCOMMERCE_URL=
WOOCOMMERCE_CONSUMER_KEY=
WOOCOMMERCE_CONSUMER_SECRET=
WOOCOMMERCE_SYNC_INTERVAL_HOURS=6

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/whatsapp_service

# Redis
REDIS_URL=redis://localhost:6379

# Admin
ADMIN_JWT_SECRET=change_me_in_production
ADMIN_DEFAULT_EMAIL=admin@example.com
ADMIN_DEFAULT_PASSWORD=admin123

# App
PORT=3000
NODE_ENV=development
```

- [ ] **Step 4: Create docker-compose.yml**

```yaml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: whatsapp_service
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

Note: Use `pgvector/pgvector:pg16` image — it includes PostgreSQL 16 with the pgvector extension pre-installed. No need to manually `CREATE EXTENSION`.

- [ ] **Step 5: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/app.ts'],
    },
  },
});
```

- [ ] **Step 6: Create minimal src/app.ts**

```typescript
import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/health', async () => {
  return { status: 'ok' };
});

const start = async () => {
  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen({ port, host: '0.0.0.0' });
};

start();
```

- [ ] **Step 7: Add scripts to package.json**

Add these to the `"scripts"` section of `package.json`:

```json
{
  "scripts": {
    "dev": "tsx watch src/app.ts",
    "build": "tsc",
    "start": "node dist/app.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:push": "prisma db push"
  }
}
```

- [ ] **Step 8: Start Docker services and verify app starts**

```bash
docker-compose up -d
npm run dev
# Visit http://localhost:3000/health → should return {"status":"ok"}
# Ctrl+C to stop
```

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json .env.example docker-compose.yml vitest.config.ts src/app.ts
git commit -m "feat: project scaffolding with Fastify, TypeScript, Docker Compose"
```

---

### Task 2: Database Schema & Prisma

**Files:**
- Create: `prisma/schema.prisma`

- [ ] **Step 1: Initialize Prisma**

```bash
npx prisma init
```

This creates `prisma/schema.prisma` and adds `DATABASE_URL` to `.env` (`.env` should already exist from copying `.env.example`).

- [ ] **Step 2: Write Prisma schema**

Replace the contents of `prisma/schema.prisma` with:

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector", schema: "public")]
}

enum ConversationStatus {
  ai
  human
  closed
}

enum MessageRole {
  user
  bot
  agent
}

enum AgentRole {
  admin
  agent
}

enum KnowledgeCategory {
  product
  faq
  policy
}

enum KnowledgeSource {
  woocommerce
  manual
}

model Conversation {
  id              String             @id @default(uuid())
  waContactId     String             @map("wa_contact_id")
  contactName     String?            @map("contact_name")
  contactPhone    String             @map("contact_phone")
  status          ConversationStatus @default(ai)
  assignedAgentId String?            @map("assigned_agent_id")
  assignedAgent   Agent?             @relation(fields: [assignedAgentId], references: [id])
  messages        Message[]
  createdAt       DateTime           @default(now()) @map("created_at")
  updatedAt       DateTime           @updatedAt @map("updated_at")

  @@index([waContactId])
  @@index([status])
  @@map("conversations")
}

model Message {
  id             String       @id @default(uuid())
  conversationId String       @map("conversation_id")
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           MessageRole
  content        String
  waMessageId    String?      @unique @map("wa_message_id")
  createdAt      DateTime     @default(now()) @map("created_at")

  @@index([conversationId])
  @@map("messages")
}

model Agent {
  id            String         @id @default(uuid())
  name          String
  email         String         @unique
  passwordHash  String         @map("password_hash")
  role          AgentRole      @default(agent)
  isActive      Boolean        @default(true) @map("is_active")
  conversations Conversation[]
  createdAt     DateTime       @default(now()) @map("created_at")

  @@map("agents")
}

model KnowledgeDoc {
  id        String            @id @default(uuid())
  title     String
  content   String
  category  KnowledgeCategory
  source    KnowledgeSource
  metadata  Json?             @default("{}")
  embedding Unsupported("vector(1536)")?
  createdAt DateTime          @default(now()) @map("created_at")
  updatedAt DateTime          @updatedAt @map("updated_at")

  @@map("knowledge_docs")
}
```

Key notes:
- `pgvector` is enabled via `extensions` in datasource.
- `embedding` uses `Unsupported("vector(1536)")` because Prisma doesn't natively support the `vector` type. Raw SQL will be used for vector operations.
- The `@@map` annotations map to snake_case table/column names in PostgreSQL.

- [ ] **Step 3: Run migration**

Make sure Docker postgres is running, then:

```bash
npx prisma migrate dev --name init
```

This creates the tables and enables the pgvector extension. Verify the migration succeeded.

- [ ] **Step 4: Create vector index via raw SQL migration**

Create a new file `prisma/migrations/add_vector_index/migration.sql`:

```bash
mkdir -p prisma/migrations/add_vector_index
```

Write the file:

```sql
-- Create HNSW index for fast approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS knowledge_docs_embedding_idx
ON knowledge_docs
USING hnsw (embedding vector_cosine_ops);
```

Then apply:

```bash
npx prisma migrate dev --name add_vector_index
```

- [ ] **Step 5: Generate Prisma client and verify**

```bash
npx prisma generate
```

Then test the connection by adding a temporary check to `src/app.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Add inside the start() function, before app.listen:
await prisma.$connect();
console.log('Database connected');
```

Run `npm run dev` to verify the connection, then remove the temporary code.

- [ ] **Step 6: Commit**

```bash
git add prisma/ src/app.ts
git commit -m "feat: Prisma schema with conversations, messages, agents, knowledge_docs + pgvector"
```

---

### Task 3: Configuration & Common Utilities

**Files:**
- Create: `src/config/index.ts`
- Create: `src/common/types.ts`
- Create: `src/common/errors.ts`
- Create: `src/common/logger.ts`
- Create: `src/plugins/prisma.plugin.ts`
- Create: `src/plugins/redis.plugin.ts`

- [ ] **Step 1: Create config with zod validation**

`src/config/index.ts`:

```typescript
import { z } from 'zod';

const envSchema = z.object({
  // WhatsApp
  WHATSAPP_API_TOKEN: z.string().min(1),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1),
  WHATSAPP_APP_SECRET: z.string().min(1),

  // LLM
  LLM_PROVIDER: z.enum(['claude', 'openai', 'deepseek']).default('openai'),
  CLAUDE_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),

  // Embedding
  EMBEDDING_API_KEY: z.string().min(1),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

  // WooCommerce
  WOOCOMMERCE_URL: z.string().url(),
  WOOCOMMERCE_CONSUMER_KEY: z.string().min(1),
  WOOCOMMERCE_CONSUMER_SECRET: z.string().min(1),
  WOOCOMMERCE_SYNC_INTERVAL_HOURS: z.coerce.number().default(6),

  // Database
  DATABASE_URL: z.string().min(1),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Admin
  ADMIN_JWT_SECRET: z.string().min(8),
  ADMIN_DEFAULT_EMAIL: z.string().email(),
  ADMIN_DEFAULT_PASSWORD: z.string().min(6),

  // App
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

let _config: Env | null = null;

export function loadConfig(): Env {
  if (_config) return _config;
  _config = envSchema.parse(process.env);
  return _config;
}

export function getConfig(): Env {
  if (!_config) throw new Error('Config not loaded. Call loadConfig() first.');
  return _config;
}
```

- [ ] **Step 2: Create common types**

`src/common/types.ts`:

```typescript
export { ConversationStatus, MessageRole, AgentRole, KnowledgeCategory, KnowledgeSource } from '@prisma/client';

export interface LLMResponse {
  content: string;
  handoff: boolean;
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
}

export interface VectorSearchResult {
  id: string;
  title: string;
  content: string;
  category: string;
  similarity: number;
}
```

- [ ] **Step 3: Create error classes**

`src/common/errors.ts`:

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class WebhookVerificationError extends AppError {
  constructor(message: string = 'Webhook verification failed') {
    super(message, 401, 'WEBHOOK_VERIFICATION_FAILED');
  }
}

export class LLMError extends AppError {
  constructor(message: string, public provider: string) {
    super(message, 502, 'LLM_ERROR');
  }
}

export class HandoffError extends AppError {
  constructor(message: string) {
    super(message, 400, 'HANDOFF_ERROR');
  }
}
```

- [ ] **Step 4: Create logger**

`src/common/logger.ts`:

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});
```

Install pino-pretty as dev dependency:

```bash
npm install -D pino-pretty
```

- [ ] **Step 5: Create Prisma Fastify plugin**

`src/plugins/prisma.plugin.ts`:

```typescript
import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const prisma = new PrismaClient();
  await prisma.$connect();

  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});
```

Install fastify-plugin:

```bash
npm install fastify-plugin
```

- [ ] **Step 6: Create Redis Fastify plugin**

`src/plugins/redis.plugin.ts`:

```typescript
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
```

- [ ] **Step 7: Update app.ts to use config and plugins**

Replace `src/app.ts`:

```typescript
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
```

Install dotenv:

```bash
npm install dotenv
```

- [ ] **Step 8: Verify app starts with config and plugins**

Copy `.env.example` to `.env`, fill in placeholder values for required fields, then:

```bash
npm run dev
# Should connect to PostgreSQL and Redis, serve /health
```

- [ ] **Step 9: Commit**

```bash
git add src/config/ src/common/ src/plugins/ src/app.ts package.json package-lock.json
git commit -m "feat: configuration validation, common utilities, Prisma and Redis plugins"
```

---

### Task 4: WhatsApp Module

**Files:**
- Create: `src/modules/whatsapp/whatsapp.types.ts`
- Create: `src/modules/whatsapp/whatsapp.service.ts`
- Create: `src/modules/whatsapp/webhook.controller.ts`
- Create: `tests/modules/whatsapp/whatsapp.service.test.ts`
- Create: `tests/modules/whatsapp/webhook.controller.test.ts`
- Create: `tests/helpers/setup.ts`

- [ ] **Step 1: Create WhatsApp types**

`src/modules/whatsapp/whatsapp.types.ts`:

```typescript
// Incoming webhook payload from Meta
export interface WebhookPayload {
  object: string;
  entry: WebhookEntry[];
}

export interface WebhookEntry {
  id: string;
  changes: WebhookChange[];
}

export interface WebhookChange {
  value: {
    messaging_product: string;
    metadata: {
      display_phone_number: string;
      phone_number_id: string;
    };
    contacts?: WebhookContact[];
    messages?: WebhookMessage[];
    statuses?: WebhookStatus[];
  };
  field: string;
}

export interface WebhookContact {
  profile: { name: string };
  wa_id: string;
}

export interface WebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'reaction';
  text?: { body: string };
}

export interface WebhookStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
}

// Parsed incoming message (our internal representation)
export interface IncomingMessage {
  waMessageId: string;
  from: string;       // phone number
  contactName: string;
  text: string;
  timestamp: string;
}
```

- [ ] **Step 2: Write failing tests for WhatsApp service**

`tests/helpers/setup.ts`:

```typescript
import { vi } from 'vitest';

// Mock axios globally for tests
export function createMockAxios() {
  return {
    post: vi.fn(),
    get: vi.fn(),
  };
}
```

`tests/modules/whatsapp/whatsapp.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppService } from '../../../src/modules/whatsapp/whatsapp.service.js';

describe('WhatsAppService', () => {
  let service: WhatsAppService;
  let mockPost: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockPost = vi.fn().mockResolvedValue({ status: 200, data: { messages: [{ id: 'wamid.123' }] } });
    service = new WhatsAppService({
      apiToken: 'test-token',
      phoneNumberId: '123456',
      post: mockPost,
    });
  });

  describe('sendTextMessage', () => {
    it('should send a text message via WhatsApp Cloud API', async () => {
      await service.sendTextMessage('5511999999999', 'Hello!');

      expect(mockPost).toHaveBeenCalledWith(
        'https://graph.facebook.com/v21.0/123456/messages',
        {
          messaging_product: 'whatsapp',
          to: '5511999999999',
          type: 'text',
          text: { body: 'Hello!' },
        },
        {
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        }
      );
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should return true for valid HMAC signature', () => {
      const result = WhatsAppService.verifySignature(
        'test-secret',
        'test-body',
        // pre-computed HMAC-SHA256 of "test-body" with key "test-secret"
        'sha256=' + require('crypto').createHmac('sha256', 'test-secret').update('test-body').digest('hex')
      );
      expect(result).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const result = WhatsAppService.verifySignature('test-secret', 'test-body', 'sha256=invalid');
      expect(result).toBe(false);
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test -- tests/modules/whatsapp/whatsapp.service.test.ts
```

Expected: FAIL — `WhatsAppService` module not found.

- [ ] **Step 4: Implement WhatsApp service**

`src/modules/whatsapp/whatsapp.service.ts`:

```typescript
import crypto from 'node:crypto';

interface WhatsAppServiceDeps {
  apiToken: string;
  phoneNumberId: string;
  post: (url: string, data: unknown, config: unknown) => Promise<unknown>;
}

export class WhatsAppService {
  private apiToken: string;
  private phoneNumberId: string;
  private post: WhatsAppServiceDeps['post'];
  private baseUrl: string;

  constructor(deps: WhatsAppServiceDeps) {
    this.apiToken = deps.apiToken;
    this.phoneNumberId = deps.phoneNumberId;
    this.post = deps.post;
    this.baseUrl = `https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`;
  }

  async sendTextMessage(to: string, body: string): Promise<void> {
    await this.post(
      this.baseUrl,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  static verifySignature(appSecret: string, rawBody: string, signatureHeader: string): boolean {
    const expectedSignature =
      'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signatureHeader)
    );
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- tests/modules/whatsapp/whatsapp.service.test.ts
```

Expected: PASS

- [ ] **Step 6: Write webhook controller tests**

`tests/modules/whatsapp/webhook.controller.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseWebhookMessages } from '../../../src/modules/whatsapp/webhook.controller.js';
import type { WebhookPayload, IncomingMessage } from '../../../src/modules/whatsapp/whatsapp.types.js';

describe('parseWebhookMessages', () => {
  it('should parse text messages from webhook payload', () => {
    const payload: WebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'entry-1',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '15551234567',
                  phone_number_id: 'phone-1',
                },
                contacts: [{ profile: { name: 'John Doe' }, wa_id: '5511999999999' }],
                messages: [
                  {
                    from: '5511999999999',
                    id: 'wamid.abc123',
                    timestamp: '1700000000',
                    type: 'text',
                    text: { body: 'Hello, I want to buy a product' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    const result: IncomingMessage[] = parseWebhookMessages(payload);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      waMessageId: 'wamid.abc123',
      from: '5511999999999',
      contactName: 'John Doe',
      text: 'Hello, I want to buy a product',
      timestamp: '1700000000',
    });
  });

  it('should return empty array for status-only payloads', () => {
    const payload: WebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'entry-1',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '15551234567', phone_number_id: 'phone-1' },
                statuses: [{ id: 'wamid.xyz', status: 'delivered', timestamp: '1700000000', recipient_id: '5511999999999' }],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    const result = parseWebhookMessages(payload);
    expect(result).toHaveLength(0);
  });

  it('should skip non-text messages', () => {
    const payload: WebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'entry-1',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '15551234567', phone_number_id: 'phone-1' },
                contacts: [{ profile: { name: 'John' }, wa_id: '5511999999999' }],
                messages: [
                  { from: '5511999999999', id: 'wamid.img', timestamp: '1700000000', type: 'image' },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    const result = parseWebhookMessages(payload);
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

```bash
npm test -- tests/modules/whatsapp/webhook.controller.test.ts
```

Expected: FAIL — `parseWebhookMessages` not found.

- [ ] **Step 8: Implement webhook controller**

`src/modules/whatsapp/webhook.controller.ts`:

```typescript
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
  app.post('/webhook', {
    config: { rawBody: true },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
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
```

- [ ] **Step 9: Run all WhatsApp tests**

```bash
npm test -- tests/modules/whatsapp/
```

Expected: all PASS.

- [ ] **Step 10: Register webhook routes in app.ts**

Update `src/app.ts` — add after the plugins are registered:

```typescript
import { webhookRoutes } from './modules/whatsapp/webhook.controller.js';

// Inside buildApp(), after plugin registrations:
await app.register(webhookRoutes);
```

Also enable raw body support by adding to the Fastify constructor options:

```typescript
const app = Fastify({
  logger: true,
  // Required for WhatsApp signature verification
});

// Add raw body hook
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  try {
    const json = JSON.parse(body as string);
    (req as any).rawBody = body;
    done(null, json);
  } catch (err) {
    done(err as Error, undefined);
  }
});
```

- [ ] **Step 11: Commit**

```bash
git add src/modules/whatsapp/ tests/modules/whatsapp/ tests/helpers/ src/app.ts
git commit -m "feat: WhatsApp webhook controller and message sending service"
```

---

### Task 5: Conversation & Session Module

**Files:**
- Create: `src/modules/conversation/conversation.service.ts`
- Create: `src/modules/conversation/session.service.ts`
- Create: `tests/modules/conversation/conversation.service.test.ts`
- Create: `tests/modules/conversation/session.service.test.ts`

- [ ] **Step 1: Write failing tests for conversation service**

`tests/modules/conversation/conversation.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationService } from '../../../src/modules/conversation/conversation.service.js';

describe('ConversationService', () => {
  let service: ConversationService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      conversation: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      message: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
    };
    service = new ConversationService(mockPrisma);
  });

  describe('findOrCreateConversation', () => {
    it('should return existing open conversation for a contact', async () => {
      const existing = { id: 'conv-1', waContactId: 'wa-123', status: 'ai' };
      mockPrisma.conversation.findFirst.mockResolvedValue(existing);

      const result = await service.findOrCreateConversation('wa-123', 'John', '+1234567890');
      expect(result).toEqual(existing);
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    });

    it('should create new conversation if none open', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);
      const created = { id: 'conv-2', waContactId: 'wa-123', status: 'ai' };
      mockPrisma.conversation.create.mockResolvedValue(created);

      const result = await service.findOrCreateConversation('wa-123', 'John', '+1234567890');
      expect(result).toEqual(created);
      expect(mockPrisma.conversation.create).toHaveBeenCalledWith({
        data: {
          waContactId: 'wa-123',
          contactName: 'John',
          contactPhone: '+1234567890',
          status: 'ai',
        },
      });
    });
  });

  describe('addMessage', () => {
    it('should create a message and update conversation timestamp', async () => {
      const msg = { id: 'msg-1', conversationId: 'conv-1', role: 'user', content: 'Hello' };
      mockPrisma.message.create.mockResolvedValue(msg);
      mockPrisma.conversation.update.mockResolvedValue({});

      const result = await service.addMessage('conv-1', 'user', 'Hello', 'wamid.123');
      expect(result).toEqual(msg);
      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv-1',
          role: 'user',
          content: 'Hello',
          waMessageId: 'wamid.123',
        },
      });
    });
  });

  describe('getRecentMessages', () => {
    it('should return last N messages for a conversation', async () => {
      const messages = [
        { id: 'msg-1', role: 'user', content: 'Hi' },
        { id: 'msg-2', role: 'bot', content: 'Hello!' },
      ];
      mockPrisma.message.findMany.mockResolvedValue(messages);

      const result = await service.getRecentMessages('conv-1', 10);
      expect(result).toEqual(messages);
      expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
        where: { conversationId: 'conv-1' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
    });
  });

  describe('updateStatus', () => {
    it('should update conversation status', async () => {
      mockPrisma.conversation.update.mockResolvedValue({ id: 'conv-1', status: 'human' });

      await service.updateStatus('conv-1', 'human');
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { status: 'human' },
      });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/modules/conversation/conversation.service.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement conversation service**

`src/modules/conversation/conversation.service.ts`:

```typescript
import { PrismaClient, Conversation, Message, ConversationStatus, MessageRole } from '@prisma/client';

export class ConversationService {
  constructor(private prisma: PrismaClient) {}

  async findOrCreateConversation(
    waContactId: string,
    contactName: string,
    contactPhone: string
  ): Promise<Conversation> {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        waContactId,
        status: { not: 'closed' },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        waContactId,
        contactName,
        contactPhone,
        status: 'ai',
      },
    });
  }

  async addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    waMessageId?: string
  ): Promise<Message> {
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        waMessageId: waMessageId ?? null,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  async getRecentMessages(conversationId: string, limit: number = 20): Promise<Message[]> {
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async updateStatus(conversationId: string, status: ConversationStatus, assignedAgentId?: string): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { status, ...(assignedAgentId ? { assignedAgentId } : {}) },
    });
  }

  async getConversationById(id: string): Promise<Conversation | null> {
    return this.prisma.conversation.findUnique({ where: { id } });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/modules/conversation/conversation.service.test.ts
```

Expected: PASS

- [ ] **Step 5: Write failing tests for session service**

`tests/modules/conversation/session.service.test.ts`:

```typescript
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
      // lrange returns newest-first, we reverse to chronological
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
```

- [ ] **Step 6: Run tests to verify they fail, then implement**

```bash
npm test -- tests/modules/conversation/session.service.test.ts
```

Expected: FAIL

`src/modules/conversation/session.service.ts`:

```typescript
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
```

- [ ] **Step 7: Run all conversation tests**

```bash
npm test -- tests/modules/conversation/
```

Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add src/modules/conversation/ tests/modules/conversation/
git commit -m "feat: conversation service and Redis session management"
```

---

### Task 6: LLM Abstraction Layer

**Files:**
- Create: `src/modules/ai/llm.types.ts`
- Create: `src/modules/ai/providers/claude.provider.ts`
- Create: `src/modules/ai/providers/openai.provider.ts`
- Create: `src/modules/ai/providers/deepseek.provider.ts`
- Create: `src/modules/ai/llm.factory.ts`
- Create: `tests/modules/ai/llm.factory.test.ts`

- [ ] **Step 1: Define LLM provider interface**

`src/modules/ai/llm.types.ts`:

```typescript
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletionResult {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LLMProvider {
  name: string;
  complete(messages: LLMMessage[]): Promise<LLMCompletionResult>;
}
```

- [ ] **Step 2: Implement Claude provider**

`src/modules/ai/providers/claude.provider.ts`:

```typescript
import axios from 'axios';
import type { LLMProvider, LLMMessage, LLMCompletionResult } from '../llm.types.js';

export class ClaudeProvider implements LLMProvider {
  name = 'claude';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-20250514') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async complete(messages: LLMMessage[]): Promise<LLMCompletionResult> {
    // Claude API uses a separate system parameter
    const systemMessage = messages.find((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: this.model,
        max_tokens: 1024,
        system: systemMessage?.content ?? '',
        messages: nonSystemMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      },
      {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      }
    );

    const data = response.data;
    return {
      content: data.content[0].text,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      },
    };
  }
}
```

- [ ] **Step 3: Implement OpenAI provider**

`src/modules/ai/providers/openai.provider.ts`:

```typescript
import axios from 'axios';
import type { LLMProvider, LLMMessage, LLMCompletionResult } from '../llm.types.js';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async complete(messages: LLMMessage[]): Promise<LLMCompletionResult> {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: 1024,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = response.data;
    return {
      content: data.choices[0].message.content,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
    };
  }
}
```

- [ ] **Step 4: Implement DeepSeek provider**

`src/modules/ai/providers/deepseek.provider.ts`:

```typescript
import axios from 'axios';
import type { LLMProvider, LLMMessage, LLMCompletionResult } from '../llm.types.js';

export class DeepSeekProvider implements LLMProvider {
  name = 'deepseek';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'deepseek-chat') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async complete(messages: LLMMessage[]): Promise<LLMCompletionResult> {
    // DeepSeek uses OpenAI-compatible API
    const response = await axios.post(
      'https://api.deepseek.com/chat/completions',
      {
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: 1024,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = response.data;
    return {
      content: data.choices[0].message.content,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
    };
  }
}
```

- [ ] **Step 5: Implement LLM factory**

`src/modules/ai/llm.factory.ts`:

```typescript
import type { LLMProvider } from './llm.types.js';
import { ClaudeProvider } from './providers/claude.provider.js';
import { OpenAIProvider } from './providers/openai.provider.js';
import { DeepSeekProvider } from './providers/deepseek.provider.js';

export type LLMProviderName = 'claude' | 'openai' | 'deepseek';

interface LLMFactoryConfig {
  provider: LLMProviderName;
  claudeApiKey?: string;
  openaiApiKey?: string;
  deepseekApiKey?: string;
}

export function createLLMProvider(config: LLMFactoryConfig): LLMProvider {
  switch (config.provider) {
    case 'claude':
      if (!config.claudeApiKey) throw new Error('CLAUDE_API_KEY is required when LLM_PROVIDER=claude');
      return new ClaudeProvider(config.claudeApiKey);
    case 'openai':
      if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER=openai');
      return new OpenAIProvider(config.openaiApiKey);
    case 'deepseek':
      if (!config.deepseekApiKey) throw new Error('DEEPSEEK_API_KEY is required when LLM_PROVIDER=deepseek');
      return new DeepSeekProvider(config.deepseekApiKey);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}
```

- [ ] **Step 6: Write factory tests**

`tests/modules/ai/llm.factory.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createLLMProvider } from '../../../src/modules/ai/llm.factory.js';
import { ClaudeProvider } from '../../../src/modules/ai/providers/claude.provider.js';
import { OpenAIProvider } from '../../../src/modules/ai/providers/openai.provider.js';
import { DeepSeekProvider } from '../../../src/modules/ai/providers/deepseek.provider.js';

describe('createLLMProvider', () => {
  it('should create Claude provider', () => {
    const provider = createLLMProvider({ provider: 'claude', claudeApiKey: 'sk-test' });
    expect(provider).toBeInstanceOf(ClaudeProvider);
    expect(provider.name).toBe('claude');
  });

  it('should create OpenAI provider', () => {
    const provider = createLLMProvider({ provider: 'openai', openaiApiKey: 'sk-test' });
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider.name).toBe('openai');
  });

  it('should create DeepSeek provider', () => {
    const provider = createLLMProvider({ provider: 'deepseek', deepseekApiKey: 'sk-test' });
    expect(provider).toBeInstanceOf(DeepSeekProvider);
    expect(provider.name).toBe('deepseek');
  });

  it('should throw if API key is missing', () => {
    expect(() => createLLMProvider({ provider: 'claude' })).toThrow('CLAUDE_API_KEY is required');
  });

  it('should throw for unknown provider', () => {
    expect(() => createLLMProvider({ provider: 'unknown' as any })).toThrow('Unknown LLM provider');
  });
});
```

- [ ] **Step 7: Run tests**

```bash
npm test -- tests/modules/ai/
```

Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add src/modules/ai/ tests/modules/ai/
git commit -m "feat: LLM abstraction layer with Claude, OpenAI, and DeepSeek providers"
```

---

### Task 7: Knowledge Base & RAG

**Files:**
- Create: `src/modules/knowledge/knowledge.types.ts`
- Create: `src/modules/knowledge/embedding.service.ts`
- Create: `src/modules/knowledge/knowledge.service.ts`
- Create: `tests/modules/knowledge/embedding.service.test.ts`
- Create: `tests/modules/knowledge/knowledge.service.test.ts`

- [ ] **Step 1: Create knowledge types**

`src/modules/knowledge/knowledge.types.ts`:

```typescript
export interface VectorSearchResult {
  id: string;
  title: string;
  content: string;
  category: string;
  similarity: number;
}

export interface CreateKnowledgeDocInput {
  title: string;
  content: string;
  category: 'product' | 'faq' | 'policy';
  source: 'woocommerce' | 'manual';
  metadata?: Record<string, unknown>;
}
```

- [ ] **Step 2: Write failing tests for embedding service**

`tests/modules/knowledge/embedding.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingService } from '../../../src/modules/knowledge/embedding.service.js';

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let mockPost: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockPost = vi.fn().mockResolvedValue({
      data: {
        data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 5, total_tokens: 5 },
      },
    });
    service = new EmbeddingService({
      apiKey: 'test-key',
      model: 'text-embedding-3-small',
      post: mockPost,
    });
  });

  it('should generate embedding for text', async () => {
    const result = await service.embed('Hello world');
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(mockPost).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      { input: 'Hello world', model: 'text-embedding-3-small' },
      { headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' } }
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails, then implement**

```bash
npm test -- tests/modules/knowledge/embedding.service.test.ts
```

Expected: FAIL

`src/modules/knowledge/embedding.service.ts`:

```typescript
interface EmbeddingServiceDeps {
  apiKey: string;
  model: string;
  post: (url: string, data: unknown, config: unknown) => Promise<any>;
}

export class EmbeddingService {
  private apiKey: string;
  private model: string;
  private post: EmbeddingServiceDeps['post'];

  constructor(deps: EmbeddingServiceDeps) {
    this.apiKey = deps.apiKey;
    this.model = deps.model;
    this.post = deps.post;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.post(
      'https://api.openai.com/v1/embeddings',
      { input: text, model: this.model },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data.data[0].embedding;
  }
}
```

Run again: Expected PASS.

- [ ] **Step 4: Write failing tests for knowledge service**

`tests/modules/knowledge/knowledge.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KnowledgeService } from '../../../src/modules/knowledge/knowledge.service.js';

describe('KnowledgeService', () => {
  let service: KnowledgeService;
  let mockPrisma: any;
  let mockEmbeddingService: any;

  beforeEach(() => {
    mockPrisma = {
      knowledgeDoc: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      $queryRawUnsafe: vi.fn(),
    };
    mockEmbeddingService = {
      embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
    };
    service = new KnowledgeService(mockPrisma, mockEmbeddingService);
  });

  describe('createDoc', () => {
    it('should create a knowledge doc with embedding', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ id: 'doc-1' }]);

      await service.createDoc({
        title: 'Test Product',
        content: 'A great product',
        category: 'product',
        source: 'manual',
      });

      expect(mockEmbeddingService.embed).toHaveBeenCalledWith('Test Product\n\nA great product');
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalled();
      // Verify the raw SQL contains INSERT with vector
      const sqlCall = mockPrisma.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sqlCall).toContain('INSERT INTO knowledge_docs');
    });
  });

  describe('searchSimilar', () => {
    it('should search for similar documents using vector similarity', async () => {
      const mockResults = [
        { id: 'doc-1', title: 'Product A', content: 'Description A', category: 'product', similarity: 0.95 },
      ];
      mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResults);

      const results = await service.searchSimilar('I want a product', 5);

      expect(mockEmbeddingService.embed).toHaveBeenCalledWith('I want a product');
      expect(results).toEqual(mockResults);
      const sqlCall = mockPrisma.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sqlCall).toContain('1 - (embedding <=> ');
    });
  });
});
```

- [ ] **Step 5: Run test to verify it fails, then implement**

```bash
npm test -- tests/modules/knowledge/knowledge.service.test.ts
```

Expected: FAIL

`src/modules/knowledge/knowledge.service.ts`:

```typescript
import { PrismaClient, KnowledgeDoc } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import type { EmbeddingService } from './embedding.service.js';
import type { CreateKnowledgeDocInput, VectorSearchResult } from './knowledge.types.js';

export class KnowledgeService {
  constructor(
    private prisma: PrismaClient,
    private embeddingService: EmbeddingService
  ) {}

  async createDoc(input: CreateKnowledgeDocInput): Promise<void> {
    const embeddingText = `${input.title}\n\n${input.content}`;
    const embedding = await this.embeddingService.embed(embeddingText);
    const vectorStr = `[${embedding.join(',')}]`;
    const id = uuidv4();
    const metadata = JSON.stringify(input.metadata ?? {});

    await this.prisma.$queryRawUnsafe(
      `INSERT INTO knowledge_docs (id, title, content, category, source, metadata, embedding, created_at, updated_at)
       VALUES ($1, $2, $3, $4::\"KnowledgeCategory\", $5::\"KnowledgeSource\", $6::jsonb, $7::vector, NOW(), NOW())`,
      id,
      input.title,
      input.content,
      input.category,
      input.source,
      metadata,
      vectorStr
    );
  }

  async searchSimilar(query: string, topK: number = 5): Promise<VectorSearchResult[]> {
    const queryEmbedding = await this.embeddingService.embed(query);
    const vectorStr = `[${queryEmbedding.join(',')}]`;

    const results = await this.prisma.$queryRawUnsafe<VectorSearchResult[]>(
      `SELECT id, title, content, category,
              1 - (embedding <=> $1::vector) AS similarity
       FROM knowledge_docs
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      vectorStr,
      topK
    );

    return results;
  }

  async listDocs(category?: string): Promise<KnowledgeDoc[]> {
    return this.prisma.knowledgeDoc.findMany({
      where: category ? { category: category as any } : {},
      orderBy: { updatedAt: 'desc' },
    });
  }

  async deleteDoc(id: string): Promise<void> {
    await this.prisma.knowledgeDoc.delete({ where: { id } });
  }

  async updateDoc(id: string, input: Partial<CreateKnowledgeDocInput>): Promise<void> {
    if (input.title || input.content) {
      // If content changed, re-embed
      const existing = await this.prisma.knowledgeDoc.findUnique({ where: { id } });
      if (!existing) throw new Error(`Knowledge doc ${id} not found`);

      const title = input.title ?? existing.title;
      const content = input.content ?? existing.content;
      const embeddingText = `${title}\n\n${content}`;
      const embedding = await this.embeddingService.embed(embeddingText);
      const vectorStr = `[${embedding.join(',')}]`;

      await this.prisma.$queryRawUnsafe(
        `UPDATE knowledge_docs SET title = $2, content = $3, embedding = $4::vector, updated_at = NOW()
         WHERE id = $1`,
        id,
        title,
        content,
        vectorStr
      );
    } else {
      await this.prisma.knowledgeDoc.update({
        where: { id },
        data: { ...(input.metadata ? { metadata: input.metadata as any } : {}) },
      });
    }
  }
}
```

- [ ] **Step 6: Run all knowledge tests**

```bash
npm test -- tests/modules/knowledge/
```

Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add src/modules/knowledge/ tests/modules/knowledge/
git commit -m "feat: knowledge base with embedding service and pgvector similarity search"
```

---

### Task 8: Prompt Builder & Message Pipeline

**Files:**
- Create: `src/modules/ai/prompt.builder.ts`
- Create: `src/modules/pipeline/message.pipeline.ts`
- Create: `tests/modules/ai/prompt.builder.test.ts`
- Create: `tests/modules/pipeline/message.pipeline.test.ts`

- [ ] **Step 1: Write failing tests for prompt builder**

`tests/modules/ai/prompt.builder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PromptBuilder } from '../../../src/modules/ai/prompt.builder.js';
import type { LLMMessage } from '../../../src/modules/ai/llm.types.js';
import type { SessionMessage } from '../../../src/modules/conversation/session.service.js';
import type { VectorSearchResult } from '../../../src/modules/knowledge/knowledge.types.js';

describe('PromptBuilder', () => {
  const builder = new PromptBuilder({
    companyName: 'TestShop',
    systemPromptOverride: undefined,
  });

  it('should build messages array with system prompt, knowledge context, history, and user message', () => {
    const knowledgeContext: VectorSearchResult[] = [
      { id: '1', title: 'Widget', content: 'A premium widget, $29.99', category: 'product', similarity: 0.9 },
    ];
    const history: SessionMessage[] = [
      { role: 'user', content: 'Hi' },
      { role: 'bot', content: 'Hello! How can I help?' },
    ];
    const userMessage = 'Tell me about widgets';

    const result: LLMMessage[] = builder.build(knowledgeContext, history, userMessage);

    expect(result).toHaveLength(4); // system + 2 history + user
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('TestShop');
    expect(result[0].content).toContain('[HANDOFF]');
    expect(result[0].content).toContain('Widget');
    expect(result[0].content).toContain('$29.99');
    expect(result[1]).toEqual({ role: 'user', content: 'Hi' });
    expect(result[2]).toEqual({ role: 'assistant', content: 'Hello! How can I help?' });
    expect(result[3]).toEqual({ role: 'user', content: 'Tell me about widgets' });
  });

  it('should handle empty knowledge context', () => {
    const result = builder.build([], [], 'Hi');
    expect(result).toHaveLength(2); // system + user
    expect(result[0].content).toContain('No specific product information available');
  });

  it('should allow system prompt override', () => {
    const custom = new PromptBuilder({
      companyName: 'TestShop',
      systemPromptOverride: 'You are a pirate assistant.',
    });
    const result = custom.build([], [], 'Ahoy');
    expect(result[0].content).toContain('You are a pirate assistant.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails, then implement**

```bash
npm test -- tests/modules/ai/prompt.builder.test.ts
```

Expected: FAIL

`src/modules/ai/prompt.builder.ts`:

```typescript
import type { LLMMessage } from './llm.types.js';
import type { SessionMessage } from '../conversation/session.service.js';
import type { VectorSearchResult } from '../knowledge/knowledge.types.js';

interface PromptBuilderConfig {
  companyName: string;
  systemPromptOverride?: string;
}

export class PromptBuilder {
  private config: PromptBuilderConfig;

  constructor(config: PromptBuilderConfig) {
    this.config = config;
  }

  build(
    knowledgeContext: VectorSearchResult[],
    conversationHistory: SessionMessage[],
    userMessage: string
  ): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // System prompt
    const systemContent = this.buildSystemPrompt(knowledgeContext);
    messages.push({ role: 'system', content: systemContent });

    // Conversation history
    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    }

    // Current user message
    messages.push({ role: 'user', content: userMessage });

    return messages;
  }

  private buildSystemPrompt(knowledgeContext: VectorSearchResult[]): string {
    if (this.config.systemPromptOverride) {
      // Even with override, append knowledge context
      const knowledgeSection = this.formatKnowledgeContext(knowledgeContext);
      return `${this.config.systemPromptOverride}\n\n${knowledgeSection}`;
    }

    const knowledgeSection = this.formatKnowledgeContext(knowledgeContext);

    return `You are the customer service assistant for ${this.config.companyName}.
Answer customer questions based on the product information and policies below.
If you cannot answer the question or the customer requests to speak to a human agent, output [HANDOFF] at the beginning of your response.
Maintain a friendly, professional tone. Reply in the same language the customer uses.

${knowledgeSection}`;
  }

  private formatKnowledgeContext(docs: VectorSearchResult[]): string {
    if (docs.length === 0) {
      return '--- Knowledge Base ---\nNo specific product information available for this query.';
    }

    const entries = docs
      .map((doc) => `### ${doc.title} (${doc.category})\n${doc.content}`)
      .join('\n\n');

    return `--- Knowledge Base ---\n${entries}`;
  }
}
```

Run again: Expected PASS.

- [ ] **Step 3: Write failing tests for message pipeline**

`tests/modules/pipeline/message.pipeline.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessagePipeline } from '../../../src/modules/pipeline/message.pipeline.js';

describe('MessagePipeline', () => {
  let pipeline: MessagePipeline;
  let deps: any;

  beforeEach(() => {
    deps = {
      conversationService: {
        findOrCreateConversation: vi.fn().mockResolvedValue({ id: 'conv-1', status: 'ai' }),
        addMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
        updateStatus: vi.fn(),
      },
      sessionService: {
        getMessages: vi.fn().mockResolvedValue([]),
        addMessage: vi.fn(),
      },
      knowledgeService: {
        searchSimilar: vi.fn().mockResolvedValue([
          { id: 'doc-1', title: 'Widget', content: 'A great widget', category: 'product', similarity: 0.9 },
        ]),
      },
      llmProvider: {
        complete: vi.fn().mockResolvedValue({ content: 'Here is info about the widget!' }),
      },
      promptBuilder: {
        build: vi.fn().mockReturnValue([
          { role: 'system', content: 'You are...' },
          { role: 'user', content: 'Tell me about widgets' },
        ]),
      },
      whatsappService: {
        sendTextMessage: vi.fn(),
      },
      handoffService: {
        shouldHandoff: vi.fn().mockReturnValue(false),
        executeHandoff: vi.fn(),
      },
    };
    pipeline = new MessagePipeline(deps);
  });

  it('should process message through full pipeline: AI response', async () => {
    await pipeline.process({
      waMessageId: 'wamid.123',
      from: '+1234567890',
      contactName: 'John',
      text: 'Tell me about widgets',
      timestamp: '1700000000',
    });

    // 1. Find/create conversation
    expect(deps.conversationService.findOrCreateConversation).toHaveBeenCalledWith(
      '+1234567890', 'John', '+1234567890'
    );
    // 2. Save user message
    expect(deps.conversationService.addMessage).toHaveBeenCalledWith('conv-1', 'user', 'Tell me about widgets', 'wamid.123');
    // 3. Get session history
    expect(deps.sessionService.getMessages).toHaveBeenCalledWith('conv-1');
    // 4. Search knowledge base
    expect(deps.knowledgeService.searchSimilar).toHaveBeenCalledWith('Tell me about widgets', 5);
    // 5. Build prompt
    expect(deps.promptBuilder.build).toHaveBeenCalled();
    // 6. Call LLM
    expect(deps.llmProvider.complete).toHaveBeenCalled();
    // 7. Check handoff
    expect(deps.handoffService.shouldHandoff).toHaveBeenCalledWith('Here is info about the widget!', 'Tell me about widgets');
    // 8. Send response via WhatsApp
    expect(deps.whatsappService.sendTextMessage).toHaveBeenCalledWith('+1234567890', 'Here is info about the widget!');
    // 9. Save bot message + update session
    expect(deps.conversationService.addMessage).toHaveBeenCalledWith('conv-1', 'bot', 'Here is info about the widget!');
    expect(deps.sessionService.addMessage).toHaveBeenCalledTimes(2); // user + bot
  });

  it('should trigger handoff when AI returns [HANDOFF]', async () => {
    deps.llmProvider.complete.mockResolvedValue({ content: '[HANDOFF] I cannot help with refunds.' });
    deps.handoffService.shouldHandoff.mockReturnValue(true);

    await pipeline.process({
      waMessageId: 'wamid.456',
      from: '+1234567890',
      contactName: 'John',
      text: 'I want a refund',
      timestamp: '1700000000',
    });

    expect(deps.handoffService.executeHandoff).toHaveBeenCalledWith('conv-1', '+1234567890');
    // Should NOT send the AI response containing [HANDOFF]
    expect(deps.whatsappService.sendTextMessage).not.toHaveBeenCalledWith(
      '+1234567890',
      expect.stringContaining('[HANDOFF]')
    );
  });

  it('should skip AI processing for conversations in human status', async () => {
    deps.conversationService.findOrCreateConversation.mockResolvedValue({ id: 'conv-1', status: 'human' });

    await pipeline.process({
      waMessageId: 'wamid.789',
      from: '+1234567890',
      contactName: 'John',
      text: 'Hello agent',
      timestamp: '1700000000',
    });

    // Should save message but NOT call LLM
    expect(deps.conversationService.addMessage).toHaveBeenCalled();
    expect(deps.llmProvider.complete).not.toHaveBeenCalled();
    expect(deps.whatsappService.sendTextMessage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run test to verify it fails, then implement**

```bash
npm test -- tests/modules/pipeline/message.pipeline.test.ts
```

Expected: FAIL

`src/modules/pipeline/message.pipeline.ts`:

```typescript
import type { ConversationService } from '../conversation/conversation.service.js';
import type { SessionService } from '../conversation/session.service.js';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import type { LLMProvider } from '../ai/llm.types.js';
import type { PromptBuilder } from '../ai/prompt.builder.js';
import type { WhatsAppService } from '../whatsapp/whatsapp.service.js';
import type { HandoffService } from '../handoff/handoff.service.js';
import type { IncomingMessage } from '../whatsapp/whatsapp.types.js';
import { logger } from '../../common/logger.js';

interface PipelineDeps {
  conversationService: ConversationService;
  sessionService: SessionService;
  knowledgeService: KnowledgeService;
  llmProvider: LLMProvider;
  promptBuilder: PromptBuilder;
  whatsappService: WhatsAppService;
  handoffService: HandoffService;
}

export class MessagePipeline {
  constructor(private deps: PipelineDeps) {}

  async process(incoming: IncomingMessage): Promise<void> {
    const {
      conversationService,
      sessionService,
      knowledgeService,
      llmProvider,
      promptBuilder,
      whatsappService,
      handoffService,
    } = this.deps;

    // 1. Find or create conversation
    const conversation = await conversationService.findOrCreateConversation(
      incoming.from,
      incoming.contactName,
      incoming.from
    );

    // 2. Save user message to DB
    await conversationService.addMessage(conversation.id, 'user', incoming.text, incoming.waMessageId);

    // 3. Update session cache
    await sessionService.addMessage(conversation.id, { role: 'user', content: incoming.text });

    // 4. If conversation is in human mode, just save message (agent sees it in dashboard)
    if (conversation.status === 'human') {
      logger.info({ conversationId: conversation.id }, 'Message saved for human agent');
      return;
    }

    // 5. Get session history
    const history = await sessionService.getMessages(conversation.id);

    // 6. Search knowledge base for relevant context
    const knowledgeContext = await knowledgeService.searchSimilar(incoming.text, 5);

    // 7. Build LLM prompt
    const messages = promptBuilder.build(knowledgeContext, history, incoming.text);

    // 8. Call LLM
    let llmResponse;
    try {
      llmResponse = await llmProvider.complete(messages);
    } catch (error) {
      logger.error({ error }, 'LLM call failed, triggering handoff');
      const fallbackMsg = "Sorry, I'm having trouble right now. Let me connect you with a team member.";
      await whatsappService.sendTextMessage(incoming.from, fallbackMsg);
      await handoffService.executeHandoff(conversation.id, incoming.from);
      return;
    }

    // 9. Check if handoff is needed
    if (handoffService.shouldHandoff(llmResponse.content, incoming.text)) {
      await handoffService.executeHandoff(conversation.id, incoming.from);
      return;
    }

    // 10. Send AI response via WhatsApp
    await whatsappService.sendTextMessage(incoming.from, llmResponse.content);

    // 11. Save bot message to DB and session
    await conversationService.addMessage(conversation.id, 'bot', llmResponse.content);
    await sessionService.addMessage(conversation.id, { role: 'bot', content: llmResponse.content });
  }
}
```

- [ ] **Step 5: Run all pipeline and prompt tests**

```bash
npm test -- tests/modules/ai/prompt.builder.test.ts tests/modules/pipeline/message.pipeline.test.ts
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/ai/prompt.builder.ts src/modules/pipeline/ tests/modules/ai/prompt.builder.test.ts tests/modules/pipeline/
git commit -m "feat: prompt builder and message processing pipeline"
```

---

### Task 9: Human Handoff Service

**Files:**
- Create: `src/modules/handoff/handoff.service.ts`
- Create: `tests/modules/handoff/handoff.service.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/modules/handoff/handoff.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HandoffService } from '../../../src/modules/handoff/handoff.service.js';

describe('HandoffService', () => {
  let service: HandoffService;
  let deps: any;

  beforeEach(() => {
    deps = {
      conversationService: {
        updateStatus: vi.fn(),
      },
      whatsappService: {
        sendTextMessage: vi.fn(),
      },
      socketEmit: vi.fn(),
    };
    service = new HandoffService(deps);
  });

  describe('shouldHandoff', () => {
    it('should return true if AI response starts with [HANDOFF]', () => {
      expect(service.shouldHandoff('[HANDOFF] I cannot help with this.', 'I want a refund')).toBe(true);
    });

    it('should return true if AI response contains [HANDOFF] anywhere', () => {
      expect(service.shouldHandoff('Let me help. [HANDOFF]', 'complex issue')).toBe(true);
    });

    it('should return false for normal AI responses', () => {
      expect(service.shouldHandoff('Here is your product info!', 'Tell me about X')).toBe(false);
    });

    it('should return true if user explicitly requests human agent', () => {
      expect(service.shouldHandoff('Sure, I can help!', 'let me talk to a person')).toBe(true);
      expect(service.shouldHandoff('Sure!', 'I want to speak to someone')).toBe(true);
      expect(service.shouldHandoff('Sure!', 'connect me to a human')).toBe(true);
      expect(service.shouldHandoff('Sure!', 'transfer to agent')).toBe(true);
    });
  });

  describe('executeHandoff', () => {
    it('should update status, send WhatsApp message, and emit socket event', async () => {
      await service.executeHandoff('conv-1', '+1234567890');

      expect(deps.conversationService.updateStatus).toHaveBeenCalledWith('conv-1', 'human');
      expect(deps.whatsappService.sendTextMessage).toHaveBeenCalledWith(
        '+1234567890',
        expect.stringContaining('connecting you')
      );
      expect(deps.socketEmit).toHaveBeenCalledWith('handoff', { conversationId: 'conv-1' });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails, then implement**

```bash
npm test -- tests/modules/handoff/handoff.service.test.ts
```

Expected: FAIL

`src/modules/handoff/handoff.service.ts`:

```typescript
import type { ConversationService } from '../conversation/conversation.service.js';
import type { WhatsAppService } from '../whatsapp/whatsapp.service.js';

const HUMAN_REQUEST_PATTERNS = [
  /talk to a (person|human|agent|representative)/i,
  /speak to (someone|a human|an agent|a person)/i,
  /connect me to (a human|an agent|a person|someone)/i,
  /transfer to (agent|human|support)/i,
  /real person/i,
  /human agent/i,
];

interface HandoffDeps {
  conversationService: Pick<ConversationService, 'updateStatus'>;
  whatsappService: Pick<WhatsAppService, 'sendTextMessage'>;
  socketEmit: (event: string, data: unknown) => void;
}

export class HandoffService {
  constructor(private deps: HandoffDeps) {}

  shouldHandoff(aiResponse: string, userMessage: string): boolean {
    // Check if AI flagged it
    if (aiResponse.includes('[HANDOFF]')) {
      return true;
    }

    // Check if user explicitly requested human
    for (const pattern of HUMAN_REQUEST_PATTERNS) {
      if (pattern.test(userMessage)) {
        return true;
      }
    }

    return false;
  }

  async executeHandoff(conversationId: string, customerPhone: string): Promise<void> {
    // 1. Update conversation status to human
    await this.deps.conversationService.updateStatus(conversationId, 'human');

    // 2. Notify customer
    await this.deps.whatsappService.sendTextMessage(
      customerPhone,
      "I'm connecting you with a team member who can better assist you. Please hold on a moment."
    );

    // 3. Notify admin dashboard via WebSocket
    this.deps.socketEmit('handoff', { conversationId });
  }
}
```

- [ ] **Step 3: Run test**

```bash
npm test -- tests/modules/handoff/handoff.service.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/modules/handoff/ tests/modules/handoff/
git commit -m "feat: human handoff service with AI marker and user intent detection"
```

---

### Task 10: WooCommerce Sync

**Files:**
- Create: `src/modules/sync/woocommerce.client.ts`
- Create: `src/modules/sync/sync.service.ts`
- Create: `src/modules/sync/sync.scheduler.ts`
- Create: `tests/modules/sync/sync.service.test.ts`

- [ ] **Step 1: Implement WooCommerce client**

`src/modules/sync/woocommerce.client.ts`:

```typescript
import axios from 'axios';

interface WooCommerceClientConfig {
  url: string;
  consumerKey: string;
  consumerSecret: string;
}

export interface WooProduct {
  id: number;
  name: string;
  description: string;
  short_description: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_status: string;
  categories: { id: number; name: string }[];
  attributes: { name: string; options: string[] }[];
  images: { src: string }[];
  permalink: string;
  date_modified: string;
}

export class WooCommerceClient {
  private baseUrl: string;
  private auth: { username: string; password: string };

  constructor(config: WooCommerceClientConfig) {
    this.baseUrl = `${config.url}/wp-json/wc/v3`;
    this.auth = { username: config.consumerKey, password: config.consumerSecret };
  }

  async getProducts(params: {
    page?: number;
    perPage?: number;
    modifiedAfter?: string;
  } = {}): Promise<WooProduct[]> {
    const response = await axios.get(`${this.baseUrl}/products`, {
      auth: this.auth,
      params: {
        page: params.page ?? 1,
        per_page: params.perPage ?? 100,
        ...(params.modifiedAfter ? { modified_after: params.modifiedAfter } : {}),
        status: 'publish',
      },
    });
    return response.data;
  }

  async getAllProducts(modifiedAfter?: string): Promise<WooProduct[]> {
    const allProducts: WooProduct[] = [];
    let page = 1;

    while (true) {
      const products = await this.getProducts({ page, perPage: 100, modifiedAfter });
      allProducts.push(...products);
      if (products.length < 100) break;
      page++;
    }

    return allProducts;
  }
}
```

- [ ] **Step 2: Write failing tests for sync service**

`tests/modules/sync/sync.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncService } from '../../../src/modules/sync/sync.service.js';
import type { WooProduct } from '../../../src/modules/sync/woocommerce.client.js';

describe('SyncService', () => {
  let service: SyncService;
  let deps: any;

  const mockProduct: WooProduct = {
    id: 42,
    name: 'Premium Widget',
    description: '<p>A premium quality widget for all your needs.</p>',
    short_description: '<p>Premium widget</p>',
    price: '29.99',
    regular_price: '39.99',
    sale_price: '29.99',
    stock_status: 'instock',
    categories: [{ id: 1, name: 'Widgets' }],
    attributes: [{ name: 'Color', options: ['Red', 'Blue'] }],
    images: [{ src: 'https://example.com/widget.jpg' }],
    permalink: 'https://shop.example.com/product/premium-widget',
    date_modified: '2026-06-28T10:00:00',
  };

  beforeEach(() => {
    deps = {
      wooClient: {
        getAllProducts: vi.fn().mockResolvedValue([mockProduct]),
      },
      knowledgeService: {
        createDoc: vi.fn(),
      },
      prisma: {
        knowledgeDoc: {
          deleteMany: vi.fn(),
        },
      },
    };
    service = new SyncService(deps);
  });

  describe('formatProduct', () => {
    it('should format WooCommerce product into knowledge doc text', () => {
      const result = service.formatProduct(mockProduct);
      expect(result).toContain('Premium Widget');
      expect(result).toContain('29.99');
      expect(result).toContain('In Stock');
      expect(result).toContain('Widgets');
      expect(result).toContain('Color: Red, Blue');
    });
  });

  describe('syncProducts', () => {
    it('should fetch products and create knowledge docs', async () => {
      const result = await service.syncProducts();

      expect(deps.wooClient.getAllProducts).toHaveBeenCalled();
      expect(deps.knowledgeService.createDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Premium Widget',
          category: 'product',
          source: 'woocommerce',
          metadata: expect.objectContaining({ wooProductId: 42 }),
        })
      );
      expect(result.synced).toBe(1);
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails, then implement**

```bash
npm test -- tests/modules/sync/sync.service.test.ts
```

Expected: FAIL

`src/modules/sync/sync.service.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';
import type { WooCommerceClient, WooProduct } from './woocommerce.client.js';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import { logger } from '../../common/logger.js';

interface SyncServiceDeps {
  wooClient: WooCommerceClient;
  knowledgeService: KnowledgeService;
  prisma: PrismaClient;
}

export class SyncService {
  constructor(private deps: SyncServiceDeps) {}

  formatProduct(product: WooProduct): string {
    const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();
    const stockLabel = product.stock_status === 'instock' ? 'In Stock' : 'Out of Stock';
    const categories = product.categories.map((c) => c.name).join(', ');
    const attributes = product.attributes
      .map((a) => `${a.name}: ${a.options.join(', ')}`)
      .join('\n');

    let text = `Product: ${product.name}\n`;
    text += `Price: $${product.price}`;
    if (product.sale_price && product.sale_price !== product.regular_price) {
      text += ` (Regular: $${product.regular_price})`;
    }
    text += `\nAvailability: ${stockLabel}\n`;
    text += `Category: ${categories}\n`;
    if (attributes) text += `Specifications:\n${attributes}\n`;
    text += `\nDescription:\n${stripHtml(product.description || product.short_description)}\n`;
    text += `\nLink: ${product.permalink}`;

    return text;
  }

  async syncProducts(modifiedAfter?: string): Promise<{ synced: number; errors: number }> {
    logger.info({ modifiedAfter }, 'Starting WooCommerce product sync');

    const products = await this.deps.wooClient.getAllProducts(modifiedAfter);
    let synced = 0;
    let errors = 0;

    // Delete existing WooCommerce docs if doing a full sync
    if (!modifiedAfter) {
      await this.deps.prisma.knowledgeDoc.deleteMany({
        where: { source: 'woocommerce' },
      });
    }

    for (const product of products) {
      try {
        const content = this.formatProduct(product);
        await this.deps.knowledgeService.createDoc({
          title: product.name,
          content,
          category: 'product',
          source: 'woocommerce',
          metadata: {
            wooProductId: product.id,
            price: product.price,
            stockStatus: product.stock_status,
            permalink: product.permalink,
          },
        });
        synced++;
      } catch (error) {
        logger.error({ error, productId: product.id }, 'Failed to sync product');
        errors++;
      }
    }

    logger.info({ synced, errors, total: products.length }, 'WooCommerce sync complete');
    return { synced, errors };
  }
}
```

- [ ] **Step 4: Run test**

```bash
npm test -- tests/modules/sync/sync.service.test.ts
```

Expected: PASS

- [ ] **Step 5: Implement sync scheduler**

`src/modules/sync/sync.scheduler.ts`:

```typescript
import cron from 'node-cron';
import type { SyncService } from './sync.service.js';
import { logger } from '../../common/logger.js';

export class SyncScheduler {
  private task: cron.ScheduledTask | null = null;

  constructor(
    private syncService: SyncService,
    private intervalHours: number = 6
  ) {}

  start(): void {
    // Run every N hours
    const cronExpression = `0 */${this.intervalHours} * * *`;
    this.task = cron.schedule(cronExpression, async () => {
      try {
        await this.syncService.syncProducts();
      } catch (error) {
        logger.error({ error }, 'Scheduled WooCommerce sync failed');
      }
    });
    logger.info({ intervalHours: this.intervalHours }, 'WooCommerce sync scheduler started');
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
  }

  async runNow(): Promise<{ synced: number; errors: number }> {
    return this.syncService.syncProducts();
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/sync/ tests/modules/sync/
git commit -m "feat: WooCommerce product sync with scheduling"
```

---

### Task 11: Admin API

**Files:**
- Create: `src/modules/admin/auth.service.ts`
- Create: `src/modules/admin/auth.controller.ts`
- Create: `src/modules/admin/conversations.controller.ts`
- Create: `src/modules/admin/knowledge.controller.ts`
- Create: `src/modules/admin/dashboard.controller.ts`
- Create: `src/modules/admin/admin.plugin.ts`
- Create: `tests/modules/admin/auth.service.test.ts`

- [ ] **Step 1: Write failing tests for auth service**

`tests/modules/admin/auth.service.test.ts`:

```typescript
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
      expect(hash.startsWith('$2')).toBe(true); // bcrypt prefix
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
```

- [ ] **Step 2: Run test to verify it fails, then implement**

```bash
npm test -- tests/modules/admin/auth.service.test.ts
```

Expected: FAIL

`src/modules/admin/auth.service.ts`:

```typescript
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { PrismaClient, Agent } from '@prisma/client';

// Install jsonwebtoken: npm install jsonwebtoken && npm install -D @types/jsonwebtoken
// Note: We use jsonwebtoken directly instead of @fastify/jwt for the auth service
// so it can be tested independently of Fastify

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
```

Install jsonwebtoken:

```bash
npm install jsonwebtoken
npm install -D @types/jsonwebtoken
```

- [ ] **Step 3: Run tests**

```bash
npm test -- tests/modules/admin/auth.service.test.ts
```

Expected: PASS

- [ ] **Step 4: Implement auth controller**

`src/modules/admin/auth.controller.ts`:

```typescript
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

// Auth middleware — attach to admin routes
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
```

- [ ] **Step 5: Implement conversations controller**

`src/modules/admin/conversations.controller.ts`:

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { ConversationService } from '../conversation/conversation.service.js';
import type { WhatsAppService } from '../whatsapp/whatsapp.service.js';

interface ConversationsControllerDeps {
  prisma: PrismaClient;
  conversationService: ConversationService;
  whatsappService: WhatsAppService;
}

export function conversationsRoutes(deps: ConversationsControllerDeps) {
  return async function (app: FastifyInstance) {
    // List conversations
    app.get('/admin/conversations', async (request: FastifyRequest) => {
      const query = request.query as { status?: string; page?: string; limit?: string };
      const page = parseInt(query.page ?? '1', 10);
      const limit = parseInt(query.limit ?? '20', 10);
      const skip = (page - 1) * limit;

      const where = query.status ? { status: query.status as any } : {};

      const [conversations, total] = await Promise.all([
        deps.prisma.conversation.findMany({
          where,
          include: { assignedAgent: { select: { id: true, name: true } } },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: limit,
        }),
        deps.prisma.conversation.count({ where }),
      ]);

      return { conversations, total, page, limit };
    });

    // Get conversation with messages
    app.get('/admin/conversations/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const conversation = await deps.prisma.conversation.findUnique({
        where: { id },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          assignedAgent: { select: { id: true, name: true } },
        },
      });

      if (!conversation) {
        return reply.code(404).send({ error: 'Conversation not found' });
      }

      return conversation;
    });

    // Agent sends a message in a human-mode conversation
    app.post('/admin/conversations/:id/reply', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { message } = request.body as { message: string };
      const agent = (request as any).agent;

      const conversation = await deps.prisma.conversation.findUnique({ where: { id } });
      if (!conversation) {
        return reply.code(404).send({ error: 'Conversation not found' });
      }
      if (conversation.status !== 'human') {
        return reply.code(400).send({ error: 'Conversation is not in human mode' });
      }

      // Send via WhatsApp
      await deps.whatsappService.sendTextMessage(conversation.contactPhone, message);

      // Save to DB
      await deps.conversationService.addMessage(id, 'agent', message);

      // Assign agent if not already
      if (!conversation.assignedAgentId) {
        await deps.conversationService.updateStatus(id, 'human', agent.id);
      }

      return { success: true };
    });

    // Close conversation
    app.patch('/admin/conversations/:id/close', async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      await deps.conversationService.updateStatus(id, 'closed');
      return { success: true };
    });
  };
}
```

- [ ] **Step 6: Implement knowledge controller**

`src/modules/admin/knowledge.controller.ts`:

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import type { SyncScheduler } from '../sync/sync.scheduler.js';

interface KnowledgeControllerDeps {
  knowledgeService: KnowledgeService;
  syncScheduler: SyncScheduler;
}

export function knowledgeRoutes(deps: KnowledgeControllerDeps) {
  return async function (app: FastifyInstance) {
    // List knowledge docs
    app.get('/admin/knowledge', async (request: FastifyRequest) => {
      const { category } = request.query as { category?: string };
      const docs = await deps.knowledgeService.listDocs(category);
      return { docs };
    });

    // Create knowledge doc (manual)
    app.post('/admin/knowledge', async (request: FastifyRequest) => {
      const body = request.body as {
        title: string;
        content: string;
        category: 'product' | 'faq' | 'policy';
      };

      await deps.knowledgeService.createDoc({
        title: body.title,
        content: body.content,
        category: body.category,
        source: 'manual',
      });

      return { success: true };
    });

    // Update knowledge doc
    app.put('/admin/knowledge/:id', async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      const body = request.body as { title?: string; content?: string };

      await deps.knowledgeService.updateDoc(id, body);
      return { success: true };
    });

    // Delete knowledge doc
    app.delete('/admin/knowledge/:id', async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      await deps.knowledgeService.deleteDoc(id);
      return { success: true };
    });

    // Trigger WooCommerce sync manually
    app.post('/admin/knowledge/sync', async () => {
      const result = await deps.syncScheduler.runNow();
      return result;
    });
  };
}
```

- [ ] **Step 7: Implement dashboard controller**

`src/modules/admin/dashboard.controller.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

export function dashboardRoutes(prisma: PrismaClient) {
  return async function (app: FastifyInstance) {
    app.get('/admin/dashboard', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        totalConversations,
        todayConversations,
        aiConversations,
        humanConversations,
        pendingHandoffs,
        totalMessages,
      ] = await Promise.all([
        prisma.conversation.count(),
        prisma.conversation.count({ where: { createdAt: { gte: today } } }),
        prisma.conversation.count({ where: { status: 'ai' } }),
        prisma.conversation.count({ where: { status: 'human' } }),
        prisma.conversation.count({ where: { status: 'human', assignedAgentId: null } }),
        prisma.message.count({ where: { createdAt: { gte: today } } }),
      ]);

      const aiResolutionRate = totalConversations > 0
        ? ((totalConversations - humanConversations) / totalConversations * 100).toFixed(1)
        : '0';

      return {
        totalConversations,
        todayConversations,
        activeAiConversations: aiConversations,
        activeHumanConversations: humanConversations,
        pendingHandoffs,
        todayMessages: totalMessages,
        aiResolutionRate: `${aiResolutionRate}%`,
      };
    });
  };
}
```

- [ ] **Step 8: Create admin plugin to register all routes**

`src/modules/admin/admin.plugin.ts`:

```typescript
import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { AuthService } from './auth.service.js';
import { authRoutes, authMiddleware } from './auth.controller.js';
import { conversationsRoutes } from './conversations.controller.js';
import { knowledgeRoutes } from './knowledge.controller.js';
import { dashboardRoutes } from './dashboard.controller.js';
import type { ConversationService } from '../conversation/conversation.service.js';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import type { WhatsAppService } from '../whatsapp/whatsapp.service.js';
import type { SyncScheduler } from '../sync/sync.scheduler.js';

interface AdminPluginDeps {
  authService: AuthService;
  conversationService: ConversationService;
  knowledgeService: KnowledgeService;
  whatsappService: WhatsAppService;
  syncScheduler: SyncScheduler;
}

export default fp(async (app: FastifyInstance, deps: AdminPluginDeps) => {
  // Public route: login
  await app.register(authRoutes(deps.authService));

  // Protected routes: require JWT
  const middleware = authMiddleware(deps.authService);

  await app.register(async (protectedApp) => {
    protectedApp.addHook('onRequest', middleware);

    await protectedApp.register(conversationsRoutes({
      prisma: app.prisma,
      conversationService: deps.conversationService,
      whatsappService: deps.whatsappService,
    }));

    await protectedApp.register(knowledgeRoutes({
      knowledgeService: deps.knowledgeService,
      syncScheduler: deps.syncScheduler,
    }));

    await protectedApp.register(dashboardRoutes(app.prisma));
  });
});
```

- [ ] **Step 9: Run all tests**

```bash
npm test
```

Expected: all tests PASS

- [ ] **Step 10: Commit**

```bash
git add src/modules/admin/ tests/modules/admin/ package.json package-lock.json
git commit -m "feat: admin API with auth, conversations, knowledge base, and dashboard endpoints"
```

---

### Task 12: WebSocket Plugin for Real-time

**Files:**
- Create: `src/plugins/websocket.plugin.ts`

- [ ] **Step 1: Implement WebSocket plugin**

`src/plugins/websocket.plugin.ts`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/plugins/websocket.plugin.ts
git commit -m "feat: WebSocket plugin with Socket.io for real-time agent notifications"
```

---

### Task 13: App Bootstrap — Wire Everything Together

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: Rewrite app.ts to wire all modules**

Replace `src/app.ts` with the full bootstrap:

```typescript
import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './config/index.js';
import { logger } from './common/logger.js';
import prismaPlugin from './plugins/prisma.plugin.js';
import redisPlugin from './plugins/redis.plugin.js';
import websocketPlugin from './plugins/websocket.plugin.js';
import { webhookRoutes, parseWebhookMessages } from './modules/whatsapp/webhook.controller.js';
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
    post: axios.post,
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
    companyName: 'Our Store', // TODO: make configurable via admin settings
  });

  const embeddingService = new EmbeddingService({
    apiKey: config.EMBEDDING_API_KEY,
    model: config.EMBEDDING_MODEL,
    post: axios.post,
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

  // WhatsApp webhook — override POST handler to use pipeline
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

    const payload = request.body as any;
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
    // Create default admin user
    await authService.ensureDefaultAdmin(config.ADMIN_DEFAULT_EMAIL, config.ADMIN_DEFAULT_PASSWORD);
    // Start WooCommerce sync scheduler
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
```

- [ ] **Step 2: Run all tests to make sure nothing broke**

```bash
npm test
```

Expected: all PASS

- [ ] **Step 3: Start the app and verify health endpoint**

```bash
npm run dev
# GET http://localhost:3000/health → { "status": "ok", ... }
```

- [ ] **Step 4: Commit**

```bash
git add src/app.ts
git commit -m "feat: wire all modules together in app bootstrap"
```

---

### Task 14: Dockerfile & Production Config

**Files:**
- Create: `Dockerfile`
- Modify: `docker-compose.yml` (add app service)

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/app.js"]
```

- [ ] **Step 2: Update docker-compose.yml with app service**

Add to `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - '3000:3000'
    env_file:
      - .env
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: whatsapp_service
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

- [ ] **Step 3: Create .dockerignore**

```
node_modules
dist
.env
.git
tests
*.md
```

- [ ] **Step 4: Verify Docker build**

```bash
docker build -t whatsapp-service .
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "feat: Docker multi-stage build and production docker-compose config"
```

---

### Task 15: Final Integration Verification

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 2: Start the full stack with Docker Compose (dev mode)**

```bash
docker-compose up -d postgres redis
npm run dev
```

Verify:
- `GET /health` returns `{ "status": "ok" }`
- `POST /admin/login` with default credentials returns JWT
- `GET /admin/dashboard` with Bearer token returns analytics
- `GET /admin/knowledge` returns empty list
- `POST /admin/knowledge` creates a doc

- [ ] **Step 3: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: final integration fixes and verification"
```

---

## Summary

| Task | Module | Description |
|------|--------|-------------|
| 1 | Scaffolding | npm, TypeScript, Fastify, Docker Compose, Vitest |
| 2 | Database | Prisma schema, pgvector, migrations |
| 3 | Config/Common | Zod config validation, logger, error classes, plugins |
| 4 | WhatsApp | Webhook handler, message sending, signature verification |
| 5 | Conversation | Conversation CRUD, Redis session management |
| 6 | AI | LLM abstraction (Claude/OpenAI/DeepSeek), factory pattern |
| 7 | Knowledge | Embedding service, pgvector similarity search |
| 8 | Pipeline | Prompt builder, message processing pipeline |
| 9 | Handoff | Handoff detection (AI marker + user intent), state transition |
| 10 | Sync | WooCommerce product sync with cron scheduling |
| 11 | Admin API | JWT auth, conversations, knowledge, dashboard endpoints |
| 12 | WebSocket | Socket.io for real-time agent notifications |
| 13 | Bootstrap | Wire all modules together in app.ts |
| 14 | Docker | Multi-stage Dockerfile, production compose |
| 15 | Verification | Full integration test |

**Next plan:** React admin dashboard frontend (`web/`)
