// Limiti di richieste verso i provider (richieste al minuto e al giorno).
// Si contano nella tabella limite_richieste, riusando lo store di express-rate-limit:
// in serverless ogni istanza ha la sua memoria, solo il database è condiviso.
// Chiavi: ai:<provider>:min:<minuto epoch> e ai:<provider>:day:<AAAA-MM-GG> (UTC).
// I contatori scaduti li elimina la manutenzione (eliminaLimitiScaduti).
import { MySqlRateLimitStore } from '../../config/rateLimitStore.js';

const MINUTO_MS = 60_000;
const GIORNO_MS = 86_400_000;

/**
 * @param {object} opzioni
 * @param {import('mysql2/promise').Pool} opzioni.pool
 * @param {string} opzioni.nome provider (es. "mistral")
 * @param {number} opzioni.rpm richieste al minuto (0 = nessun limite)
 * @param {number} opzioni.rpd richieste al giorno (0 = nessun limite)
 * @param {() => number} [opzioni.ora] orologio, iniettabile per i test
 */
export function creaLimitatore({ pool, nome, rpm, rpd, ora = Date.now }) {
  const minuto = new MySqlRateLimitStore(pool, `ai:${nome}:min`);
  minuto.init({ windowMs: MINUTO_MS });
  const giorno = new MySqlRateLimitStore(pool, `ai:${nome}:day`);
  giorno.init({ windowMs: GIORNO_MS });

  return {
    nome,
    /**
     * Prenota una richiesta. Se un limite è raggiunto la prenotazione viene annullata
     * (il contatore non cresce) e si indica dopo quanto riprovare.
     * @returns {Promise<{ok: true} | {ok: false, limite: 'RPM'|'RPD', ritardoMs: number}>}
     */
    async prenota() {
      const adesso = ora();
      const chiaveMinuto = String(Math.floor(adesso / MINUTO_MS));
      const chiaveGiorno = new Date(adesso).toISOString().slice(0, 10);

      if (rpm > 0 && (await minuto.increment(chiaveMinuto)).totalHits > rpm) {
        await minuto.decrement(chiaveMinuto);
        return { ok: false, limite: 'RPM', ritardoMs: MINUTO_MS - (adesso % MINUTO_MS) };
      }
      if (rpd > 0 && (await giorno.increment(chiaveGiorno)).totalHits > rpd) {
        await giorno.decrement(chiaveGiorno);
        if (rpm > 0) await minuto.decrement(chiaveMinuto);
        return { ok: false, limite: 'RPD', ritardoMs: GIORNO_MS - (adesso % GIORNO_MS) };
      }
      return { ok: true };
    },
  };
}

/** Limitatori per i provider configurati: valori per provider, altrimenti quelli comuni. */
export function creaLimitatori(cfg, pool) {
  const limite = (nome, tipo) => cfg[`${nome.toUpperCase()}_MAX_${tipo}`] ?? cfg[`AI_MAX_${tipo}`];
  return Object.fromEntries(
    ['mistral', 'groq'].map((nome) => [nome, creaLimitatore({ pool, nome, rpm: limite(nome, 'RPM'), rpd: limite(nome, 'RPD') })]),
  );
}
