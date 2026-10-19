// Limiti verso i provider: richieste al minuto, richieste al giorno e token al giorno.
// In serverless ogni istanza ha la sua memoria: i contatori stanno nel database.
// - minuto: tabella limite_richieste (store di express-rate-limit), chiave ai:<provider>:min:<minuto epoch>;
// - giorno (UTC): tabella ai_quota (migrazione 014), una riga per provider e giorno con richieste e token,
//   aggiornata in modo atomico con INSERT ... ON DUPLICATE KEY UPDATE.
// I contatori del minuto scaduti li elimina la manutenzione (eliminaLimitiScaduti).
import { MySqlRateLimitStore } from '../../config/rateLimitStore.js';

const MINUTO_MS = 60_000;
const GIORNO_MS = 86_400_000;
export const PROVIDER_CON_LIMITI = ['mistral', 'cloudflare', 'groq'];

/**
 * @param {object} opzioni
 * @param {import('mysql2/promise').Pool} opzioni.pool
 * @param {string} opzioni.nome provider (es. "cloudflare")
 * @param {number} opzioni.rpm richieste al minuto (0 = nessun limite)
 * @param {number} opzioni.rpd richieste al giorno (0 = nessun limite)
 * @param {number} [opzioni.tpd] token al giorno (0 = nessun limite)
 * @param {() => number} [opzioni.ora] orologio, iniettabile per i test
 */
export function creaLimitatore({ pool, nome, rpm, rpd, tpd = 0, ora = Date.now }) {
  const minuto = new MySqlRateLimitStore(pool, `ai:${nome}:min`);
  minuto.init({ windowMs: MINUTO_MS });
  const giornoDi = (ms) => new Date(ms).toISOString().slice(0, 10);

  return {
    nome,
    /**
     * Prenota una richiesta. Se un limite è raggiunto la prenotazione viene annullata
     * (i contatori non crescono) e si indica dopo quanto riprovare.
     * @returns {Promise<{ok: true, giorno: string} | {ok: false, limite: 'RPM'|'RPD'|'TPD', ritardoMs: number}>}
     */
    async prenota() {
      const adesso = ora();
      const chiaveMinuto = String(Math.floor(adesso / MINUTO_MS));
      const giorno = giornoDi(adesso);

      if (rpm > 0 && (await minuto.increment(chiaveMinuto)).totalHits > rpm) {
        await minuto.decrement(chiaveMinuto);
        return { ok: false, limite: 'RPM', ritardoMs: MINUTO_MS - (adesso % MINUTO_MS) };
      }
      // La richiesta si conta sempre (anche senza limite): ai_quota serve anche a controllare l'uso.
      await pool.execute(
        `INSERT INTO ai_quota (provider, giorno, richieste, token) VALUES (?, ?, 1, 0)
         ON DUPLICATE KEY UPDATE richieste = richieste + 1`,
        [nome, giorno],
      );
      const [[quota]] = await pool.execute('SELECT richieste, token FROM ai_quota WHERE provider = ? AND giorno = ?', [nome, giorno]);
      // I token si conoscono solo dopo la risposta: si blocca quando il totale del giorno ha raggiunto il limite.
      const superato = rpd > 0 && quota.richieste > rpd ? 'RPD' : tpd > 0 && Number(quota.token) >= tpd ? 'TPD' : null;
      if (superato) {
        await pool.execute('UPDATE ai_quota SET richieste = GREATEST(richieste - 1, 0) WHERE provider = ? AND giorno = ?', [nome, giorno]);
        if (rpm > 0) await minuto.decrement(chiaveMinuto);
        return { ok: false, limite: superato, ritardoMs: GIORNO_MS - (adesso % GIORNO_MS) };
      }
      return { ok: true, giorno };
    },

    /**
     * Aggiunge i token consumati da una risposta al giorno in cui la richiesta è stata prenotata.
     * @param {number} token @param {string} [giorno] AAAA-MM-GG restituito da prenota()
     */
    async registraToken(token, giorno = giornoDi(ora())) {
      if (!(token > 0)) return;
      await pool.execute(
        `INSERT INTO ai_quota (provider, giorno, richieste, token) VALUES (?, ?, 0, ?) AS nuova
         ON DUPLICATE KEY UPDATE ai_quota.token = ai_quota.token + nuova.token`,
        [nome, giorno, Math.round(token)],
      );
    },
  };
}

/** Limitatori per i provider configurabili: valori per provider, altrimenti quelli comuni. */
export function creaLimitatori(cfg, pool) {
  const limite = (nome, tipo) => cfg[`${nome.toUpperCase()}_MAX_${tipo}`] ?? cfg[`AI_MAX_${tipo}`] ?? 0;
  return Object.fromEntries(
    PROVIDER_CON_LIMITI.map((nome) => [
      nome,
      creaLimitatore({ pool, nome, rpm: limite(nome, 'RPM'), rpd: limite(nome, 'RPD'), tpd: limite(nome, 'TPD') }),
    ]),
  );
}
