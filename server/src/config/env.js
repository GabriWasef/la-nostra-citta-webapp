import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const booleano = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_ORIGIN: z.url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY: booleano.default(false),

  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().regex(/^[A-Za-z0-9_]+$/, 'DB_NAME può contenere solo lettere, numeri e _'),
  DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).default(10),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET deve avere almeno 32 caratteri'),
  SESSION_MAX_AGE_HOURS: z.coerce.number().positive().default(8),

  UPLOAD_DIR: z.string().default('uploads'),
  MAX_FILES: z.coerce.number().int().min(1).max(10).default(5),
  MAX_IMAGE_MB: z.coerce.number().positive().default(10),
  MAX_VIDEO_MB: z.coerce.number().positive().default(50),

  AI_PROVIDER: z.enum(['regole', 'nessuno']).default('regole'),
  AI_WORKER_INTERVAL_MS: z.coerce.number().int().min(0).default(5000),

  RATE_LIMIT_ENABLED: booleano.default(true),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

function carica() {
  const risultato = schema.safeParse(process.env);
  if (!risultato.success) {
    const errori = risultato.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`Configurazione non valida. Controlla il file .env (vedi .env.example):\n${errori}`);
    process.exit(1);
  }
  const env = risultato.data;
  return {
    ...env,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    corsOrigins: env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    uploadDir: path.resolve(ROOT_DIR, env.UPLOAD_DIR),
  };
}

export const env = carica();
