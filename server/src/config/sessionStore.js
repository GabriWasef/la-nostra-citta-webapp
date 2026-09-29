import session from 'express-session';
import { logger } from '../utils/logger.js';

/**
 * Store di express-session sulla tabella `sessione` (migrazione 006).
 * Le sessioni sono lato server: il cookie contiene solo l'ID firmato,
 * quindi logout, sospensione e reset password le revocano subito.
 */
export class MySqlSessionStore extends session.Store {
  constructor(pool, { intervalloPuliziaMs = 15 * 60 * 1000 } = {}) {
    super();
    this.pool = pool;
    this.timer = setInterval(() => this.pulisciScadute().catch((e) => logger.warn(e, 'Pulizia sessioni')), intervalloPuliziaMs);
    this.timer.unref();
  }

  static scadenza(sess) {
    if (sess?.cookie?.expires) return new Date(sess.cookie.expires);
    return new Date(Date.now() + (sess?.cookie?.originalMaxAge ?? 24 * 3600 * 1000));
  }

  get(sid, cb) {
    this.pool
      .execute('SELECT dati FROM sessione WHERE session_id = ? AND scadenza > CURRENT_TIMESTAMP', [sid])
      .then(([righe]) => cb(null, righe.length ? JSON.parse(righe[0].dati) : null))
      .catch(cb);
  }

  set(sid, sess, cb) {
    this.pool
      .execute(
        `INSERT INTO sessione (session_id, id_utente, scadenza, dati) VALUES (?, ?, ?, ?) AS nuova
         ON DUPLICATE KEY UPDATE id_utente = nuova.id_utente, scadenza = nuova.scadenza, dati = nuova.dati`,
        [sid, sess.userId ?? null, MySqlSessionStore.scadenza(sess), JSON.stringify(sess)],
      )
      .then(() => cb?.(null))
      .catch((err) => cb?.(err));
  }

  touch(sid, sess, cb) {
    this.pool
      .execute('UPDATE sessione SET scadenza = ? WHERE session_id = ?', [MySqlSessionStore.scadenza(sess), sid])
      .then(() => cb?.(null))
      .catch((err) => cb?.(err));
  }

  destroy(sid, cb) {
    this.pool
      .execute('DELETE FROM sessione WHERE session_id = ?', [sid])
      .then(() => cb?.(null))
      .catch((err) => cb?.(err));
  }

  async pulisciScadute() {
    await this.pool.execute('DELETE FROM sessione WHERE scadenza <= CURRENT_TIMESTAMP');
  }

  close() {
    clearInterval(this.timer);
  }
}

/** Revoca tutte le sessioni di un utente (sospensione, reset password, eliminazione account). */
export async function revocaSessioniUtente(pool, idUtente, tranneSid = null) {
  await pool.execute('DELETE FROM sessione WHERE id_utente = ? AND session_id <> ?', [idUtente, tranneSid ?? '']);
}
