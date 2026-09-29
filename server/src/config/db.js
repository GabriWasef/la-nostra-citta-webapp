import mysql from 'mysql2/promise';
import { env } from './env.js';

export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: env.DB_CONNECTION_LIMIT,
  waitForConnections: true,
  charset: 'utf8mb4_0900_ai_ci',
  timezone: 'Z',
  supportBigNumbers: true,
  decimalNumbers: true,
});

// Tutte le date sono salvate e lette in UTC.
pool.pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});

/**
 * Esegue fn(conn) in una transazione: commit se termina, rollback se lancia.
 */
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const risultato = await fn(conn);
    await conn.commit();
    return risultato;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Imposta le variabili lette dai trigger dello storico (migrazione 005)
 * per la durata di fn. Le variabili vengono sempre azzerate, perché la
 * connessione torna nel pool e verrà riutilizzata da altre richieste.
 */
export async function conOperatore(conn, idOperatore, motivazione, fn) {
  await conn.query('SET @lnc_id_operatore = ?, @lnc_motivazione = ?', [idOperatore, motivazione ?? null]);
  try {
    return await fn();
  } finally {
    await conn.query('SET @lnc_id_operatore = NULL, @lnc_motivazione = NULL');
  }
}

export async function closePool() {
  await pool.end();
}
