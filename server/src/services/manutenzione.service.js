// Pulizia periodica (cron di Vercel, una volta al giorno) e ripresa delle analisi rimaste in coda.
import { DURATA_INVOCAZIONE_MS, elaboraTutti, riprendiJobBloccati } from '../ai/worker.js';
import { pool } from '../config/db.js';
import { eliminaLimitiScaduti } from '../config/rateLimitStore.js';
import { storage } from '../storage/index.js';
import { logger } from '../utils/logger.js';

const ORE_24 = 24 * 60 * 60 * 1000;

async function conteggio(nome, fn) {
  try {
    return await fn();
  } catch (err) {
    logger.error({ err, nome }, 'Passo della manutenzione non riuscito');
    return { errore: err.message };
  }
}

/** @param {{inizio?: number}} [opzioni] inizio della chiamata del cron: la funzione dura al massimo 60 s da lì */
export async function eseguiManutenzione({ inizio = Date.now() } = {}) {
  // Prima si rimettono in coda i job interrotti, poi si elabora (al massimo AI_JOB_PER_RUN).
  const jobRipresi = await conteggio('job interrotti', () => riprendiJobBloccati());
  const analisi = await conteggio('analisi', () => elaboraTutti({ scadenza: inizio + DURATA_INVOCAZIONE_MS }));
  const sessioni = await conteggio('sessioni', async () => (await pool.execute('DELETE FROM sessione WHERE scadenza <= CURRENT_TIMESTAMP'))[0].affectedRows);
  const limiti = await conteggio('limiti', () => eliminaLimitiScaduti(pool));
  const tokenRecupero = await conteggio('token', async () =>
    (await pool.execute('DELETE FROM token_recupero_password WHERE data_scadenza <= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 7 DAY)'))[0].affectedRows,
  );
  // Caricamenti iniziati e mai conclusi (l'utente ha chiuso la pagina prima di inviare).
  const fileTemporanei = await conteggio('temporanei', async () => {
    if (!storage.elencaTemporaneiVecchi) return 0;
    const vecchi = await storage.elencaTemporaneiVecchi(ORE_24);
    for (let i = 0; i < vecchi.length; i += 100) await storage.rimuoviTemporanei(vecchi.slice(i, i + 100));
    return vecchi.length;
  });
  return { job_ripresi: jobRipresi, analisi_elaborate: analisi, sessioni_scadute: sessioni, limiti_scaduti: limiti, token_recupero_eliminati: tokenRecupero, file_temporanei_eliminati: fileTemporanei };
}
