// Opzioni di connessione a MySQL, condivise da applicazione, migrazioni e seed.
import { env } from './env.js';

function opzioniTls() {
  if (!env.DB_SSL) return undefined;
  // Il certificato del server viene sempre verificato: niente rejectUnauthorized=false.
  const ssl = { rejectUnauthorized: true, minVersion: 'TLSv1.2' };
  if (env.DB_SSL_CA) ssl.ca = env.DB_SSL_CA.replace(/\\n/g, '\n');
  return ssl;
}

export function opzioniMysql({ conDatabase = true } = {}) {
  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: conDatabase ? env.DB_NAME : undefined,
    charset: 'utf8mb4_0900_ai_ci',
    timezone: 'Z',
    ssl: opzioniTls(),
    connectTimeout: 10_000,
  };
}
