import { avviaWorker } from './ai/worker.js';
import { createApp } from './app.js';
import { closePool, pool } from './config/db.js';
import { env } from './config/env.js';
import { migrazioniInSospeso, verificaVersione } from './config/migrazioni.js';
import { logger } from './utils/logger.js';

async function avvia() {
  try {
    const [[{ versione }]] = await pool.query('SELECT VERSION() AS versione');
    verificaVersione(versione);
    const mancanti = await migrazioniInSospeso(pool);
    if (mancanti.length) {
      throw new Error(
        `il database non è aggiornato (${mancanti.length} migrazioni da applicare, da ${mancanti[0]}). ` +
          'Esegui: npm run db:migrate && npm run db:seed',
      );
    }
  } catch (err) {
    logger.fatal(`Database ${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME} non utilizzabile: ${err.message}`);
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
