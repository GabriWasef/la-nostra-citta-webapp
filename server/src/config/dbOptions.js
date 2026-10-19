// Opzioni di connessione a MySQL, condivise da applicazione, migrazioni e seed.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { env, ROOT_DIR } from './env.js';

/** Certificato della CA: il file PEM (DB_SSL_CA_FILE), se esiste, altrimenti la variabile DB_SSL_CA. */
function certificatoCa() {
  const file = path.resolve(ROOT_DIR, env.DB_SSL_CA_FILE);
  if (env.DB_SSL_CA_FILE && existsSync(file)) return readFileSync(file, 'utf8');
  return env.DB_SSL_CA.replace(/\\n/g, '\n');
}

function opzioniTls() {
  if (!env.DB_SSL) return undefined;
  // Il certificato del server viene sempre verificato: niente rejectUnauthorized=false.
  const ssl = { rejectUnauthorized: true, minVersion: 'TLSv1.2' };
  const ca = certificatoCa();
  if (ca) ssl.ca = ca;
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
