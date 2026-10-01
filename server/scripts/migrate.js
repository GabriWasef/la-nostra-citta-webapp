// Applica in ordine le migrazioni di database/migrations/ non ancora eseguite.
// Uso: npm run db:migrate            (applica le nuove migrazioni)
//      npm run db:reset              (SVUOTA il database e riapplica tutto; non in produzione)
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';
import {
  fileMigrazioni,
  MIGRATIONS_DIR,
  MIGRAZIONE_INIZIALE,
  migrazioniApplicate,
  schemaUfficialePresente,
  verificaVersione,
} from '../src/config/migrazioni.js';
import { splitSqlStatements } from '../src/utils/sqlSplitter.js';

async function connessione(conDatabase = true) {
  return mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: conDatabase ? env.DB_NAME : undefined,
    charset: 'utf8mb4_0900_ai_ci',
    timezone: 'Z',
  });
}

async function creaDatabaseSeManca() {
  const conn = await connessione(false);
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
  } catch (err) {
    // L'utente applicativo potrebbe non avere il privilegio CREATE: il database va creato a mano.
    if (err.code !== 'ER_DBACCESS_DENIED_ERROR') throw err;
  } finally {
    await conn.end();
  }
}

async function svuotaDatabase(conn) {
  if (env.isProduction) throw new Error('db:reset non è consentito in produzione.');
  const [oggetti] = await conn.query(
    'SELECT TABLE_NAME AS nome, TABLE_TYPE AS tipo FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
    [env.DB_NAME],
  );
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const { nome, tipo } of oggetti) {
    await conn.query(`DROP ${tipo === 'VIEW' ? 'VIEW' : 'TABLE'} IF EXISTS \`${nome}\``);
  }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
}

export async function eseguiSqlFile(conn, file) {
  const sql = await fs.readFile(file, 'utf8');
  for (const statement of splitSqlStatements(sql)) {
    await conn.query(statement);
  }
}

export async function migra({ fresh = false, log = console.log } = {}) {
  await creaDatabaseSeManca();
  const conn = await connessione();
  try {
    const [[{ versione }]] = await conn.query('SELECT VERSION() AS versione');
    verificaVersione(versione);
    await conn.query("SET time_zone = '+00:00'");
    if (fresh) {
      await svuotaDatabase(conn);
      log('Database svuotato.');
    }
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrazioni (
      nome VARCHAR(255) PRIMARY KEY,
      data_applicazione TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);

    const applicate = await migrazioniApplicate(conn);
    // Database creato eseguendo a mano lo script ufficiale: la 001 coincide con quello
    // script, quindi la si registra come applicata e si procede con le correzioni.
    if (!applicate.has(MIGRAZIONE_INIZIALE) && (await schemaUfficialePresente(conn))) {
      await conn.query('INSERT INTO schema_migrazioni (nome) VALUES (?)', [MIGRAZIONE_INIZIALE]);
      applicate.add(MIGRAZIONE_INIZIALE);
      log(`Trovato lo schema creato con lo script ufficiale: ${MIGRAZIONE_INIZIALE} considerata già applicata.`);
    }

    let nuove = 0;
    for (const file of await fileMigrazioni()) {
      if (applicate.has(file)) continue;
      log(`Applico ${file}...`);
      try {
        await eseguiSqlFile(conn, path.join(MIGRATIONS_DIR, file));
      } catch (err) {
        // In MySQL il DDL non è transazionale: una migrazione interrotta va corretta a mano
        // (oppure, in sviluppo, con npm run db:reset).
        const suggerimento =
          err.errno === 1419
            ? '\nEsegui come root: SET PERSIST log_bin_trust_function_creators = 1; poi npm run db:reset (in sviluppo).'
            : '';
        throw new Error(`Migrazione ${file} fallita: ${err.message}${suggerimento}`);
      }
      await conn.query('INSERT INTO schema_migrazioni (nome) VALUES (?)', [file]);
      nuove++;
    }
    log(nuove ? `${nuove} migrazioni applicate.` : 'Database già aggiornato.');
  } finally {
    await conn.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  migra({ fresh: process.argv.includes('--fresh') }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
