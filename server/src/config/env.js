import path from 'node:path';
import { z } from 'zod';
import { ROOT_DIR } from './env-percorsi.js';

export { ROOT_DIR };

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
  // Connessione cifrata (TLS): obbligatoria con quasi tutti i MySQL in cloud.
  DB_SSL: booleano.default(false),
  // Certificato della CA del provider, solo se non è una CA pubblica (PEM; "\n" per andare a capo).
  DB_SSL_CA: z.string().default(''),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET deve avere almeno 32 caratteri'),
  SESSION_MAX_AGE_HOURS: z.coerce.number().positive().default(8),

  // Dove si conservano gli allegati: "locale" (cartella uploads) oppure "blob" (Vercel Blob privato).
  // Se non indicato: "blob" quando è presente BLOB_READ_WRITE_TOKEN, altrimenti "locale".
  STORAGE_DRIVER: z.enum(['locale', 'blob']).optional(),
  // Durata dei link firmati con cui il browser scarica gli allegati dal Blob privato.
  ALLEGATI_LINK_MINUTI: z.coerce.number().int().min(1).max(120).default(15),
  // Chiave della manutenzione periodica (cron di Vercel): senza, l'endpoint è disattivato.
  CRON_SECRET: z.string().default(''),
  // Dove si contano le richieste dei limiti di frequenza: "memoria" oppure "mysql"
  // (necessario quando girano più istanze, come su Vercel). Predefinito: mysql su Vercel.
  RATE_LIMIT_STORE: z.enum(['memoria', 'mysql']).optional(),

  UPLOAD_DIR: z.string().default('uploads'),
  MAX_FILES: z.coerce.number().int().min(1).max(10).default(5),
  MAX_IMAGE_MB: z.coerce.number().positive().default(10),
  MAX_VIDEO_MB: z.coerce.number().positive().default(50),

  // Geocodifica (ricerca indirizzi) tramite Nominatim di OpenStreetMap, chiamato dal server.
  GEOCODING_ENABLED: booleano.default(true),
  GEOCODING_URL: z.url().default('https://nominatim.openstreetmap.org'),
  GEOCODING_EMAIL: z.union([z.email(), z.literal('')]).default(''),

  AI_PROVIDER: z.enum(['regole', 'nessuno']).default('regole'),
  AI_WORKER_INTERVAL_MS: z.coerce.number().int().min(0).default(5000),

  RATE_LIMIT_ENABLED: booleano.default(true),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

/** Su Vercel il sito risponde all'indirizzo del progetto: lo si deduce se APP_ORIGIN non è impostato. */
function variabiliAmbiente() {
  const grezze = { ...process.env };
  if (!grezze.APP_ORIGIN) {
    const host = grezze.VERCEL_PROJECT_PRODUCTION_URL || grezze.VERCEL_URL;
    if (host) grezze.APP_ORIGIN = `https://${host}`;
  }
  // Vercel imposta variabili vuote per le integrazioni non collegate: si trattano come assenti.
  for (const chiave of ['STORAGE_DRIVER', 'RATE_LIMIT_STORE']) if (grezze[chiave] === '') delete grezze[chiave];
  return grezze;
}

function carica() {
  const risultato = schema.safeParse(variabiliAmbiente());
  if (!risultato.success) {
    const errori = risultato.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    const messaggio = `Configurazione non valida. Controlla le variabili d'ambiente (vedi .env.example):\n${errori}`;
    // Su Vercel un process.exit nasconderebbe il motivo: si lancia un errore che finisce nei log.
    if (process.env.VERCEL) throw new Error(messaggio);
    console.error(messaggio);
    process.exit(1);
  }
  const env = risultato.data;
  const isVercel = Boolean(process.env.VERCEL);
  return {
    ...env,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    isVercel,
    // Dietro il proxy di Vercel (o di un reverse proxy) l'IP e il protocollo reali sono nelle intestazioni X-Forwarded-*.
    trustProxy: process.env.TRUST_PROXY === undefined ? isVercel : env.TRUST_PROXY,
    corsOrigins: env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    uploadDir: path.resolve(ROOT_DIR, env.UPLOAD_DIR),
    storageDriver: env.STORAGE_DRIVER ?? (process.env.BLOB_READ_WRITE_TOKEN ? 'blob' : 'locale'),
    rateLimitStore: env.RATE_LIMIT_STORE ?? (isVercel ? 'mysql' : 'memoria'),
  };
}

export const env = carica();
