import { avviaWorker } from './ai/worker.js';
import { createApp } from './app.js';
import { closePool, pool } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

async function avvia() {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    logger.fatal(`Impossibile collegarsi a MySQL (${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}): ${err.message}`);
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(`La Nostra Città in ascolto su ${env.APP_ORIGIN} (porta ${env.PORT}, ambiente ${env.NODE_ENV})`);
  });
  const fermaWorker = env.AI_WORKER_INTERVAL_MS > 0 ? avviaWorker(env.AI_WORKER_INTERVAL_MS) : async () => {};

  const chiudi = async (segnale) => {
    logger.info(`${segnale} ricevuto: chiusura in corso...`);
    server.close(async () => {
      await fermaWorker();
      app.locals.close();
      await closePool();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', chiudi);
  process.on('SIGTERM', chiudi);
}

avvia();
