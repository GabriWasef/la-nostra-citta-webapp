// Store di express-rate-limit su MySQL (tabella limite_richieste, migrazione 010).
// Serve quando le richieste sono servite da più istanze (Vercel): i contatori in memoria
// sarebbero separati per istanza e non fermerebbero davvero i tentativi ripetuti.
// Il tempo è sempre quello del database, così le istanze non devono avere orologi allineati.
import { logger } from '../utils/logger.js';

export class MySqlRateLimitStore {
  /** @param {import('mysql2/promise').Pool} pool @param {string} prefisso distingue i limitatori */
  constructor(pool, prefisso) {
    this.pool = pool;
    this.prefix = `${prefisso}:`;
    this.localKeys = false;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  chiave(chiave) {
    // La colonna è lunga 190 caratteri: le chiavi più lunghe (IPv6, utenti) vengono accorciate.
    return `${this.prefix}${chiave}`.slice(0, 190);
  }

  async increment(chiave) {
    const k = this.chiave(chiave);
    // Se la finestra è scaduta il conteggio riparte da 1. Le assegnazioni di ON DUPLICATE KEY UPDATE
    // sono valutate da sinistra a destra: la scadenza viene aggiornata dopo il conteggio, quindi
    // entrambe le condizioni leggono la scadenza precedente.
    await this.pool.execute(
      `INSERT INTO limite_richieste (chiave, conteggio, scadenza)
       VALUES (?, 1, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? MICROSECOND)) AS nuova
       ON DUPLICATE KEY UPDATE
         limite_richieste.conteggio = IF(limite_richieste.scadenza <= UTC_TIMESTAMP(3), 1, limite_richieste.conteggio + 1),
         limite_richieste.scadenza  = IF(limite_richieste.scadenza <= UTC_TIMESTAMP(3), nuova.scadenza, limite_richieste.scadenza)`,
      [k, this.windowMs * 1000],
    );
    const [[riga]] = await this.pool.execute('SELECT conteggio, scadenza FROM limite_richieste WHERE chiave = ?', [k]);
    return { totalHits: riga.conteggio, resetTime: new Date(riga.scadenza) };
  }

  async decrement(chiave) {
    await this.pool.execute('UPDATE limite_richieste SET conteggio = GREATEST(conteggio - 1, 0) WHERE chiave = ?', [this.chiave(chiave)]);
  }

  async resetKey(chiave) {
    await this.pool.execute('DELETE FROM limite_richieste WHERE chiave = ?', [this.chiave(chiave)]);
  }

  async resetAll() {
    await this.pool.execute('DELETE FROM limite_richieste WHERE chiave LIKE ?', [`${this.prefix}%`]);
  }
}

/** Elimina i contatori scaduti (chiamato dalla manutenzione periodica). */
export async function eliminaLimitiScaduti(pool) {
  try {
    const [r] = await pool.execute('DELETE FROM limite_richieste WHERE scadenza <= UTC_TIMESTAMP(3)');
    return r.affectedRows;
  } catch (err) {
    logger.warn({ err: err.message }, 'Pulizia dei limiti di frequenza non riuscita');
    return 0;
  }
}
