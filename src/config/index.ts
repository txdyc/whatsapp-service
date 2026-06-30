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
