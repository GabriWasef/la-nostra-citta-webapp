// Worker della coda job_elaborazione: esegue le analisi lente fuori dalla
// richiesta HTTP. Può girare dentro il server (AI_WORKER_INTERVAL_MS > 0)
// o come processo separato (npm run worker), anche in più copie.
import path from 'node:path';
import { env } from '../config/env.js';
import { pool } from '../config/db.js';
import * as allegatoRepository from '../repositories/allegato.repository.js';
import * as analisiRepository from '../repositories/analisi.repository.js';
import { logger } from '../utils/logger.js';
import { provider } from './index.js';

const TENTATIVI_MASSIMI = 3;

const ESECUTORI = {
  async ANALISI_IMMAGINE(job) {
    if (!provider.visione) return null;
    const allegato = await allegatoRepository.findById(job.id_allegato);
    if (!allegato) return null; // allegato eliminato nel frattempo
    const esito = await provider.visione.analizza(path.join(env.uploadDir, allegato.percorso_file));
    return {
      tipo_analisi: 'ANALISI_IMMAGINE',
      modello: provider.visione.modello,
      risultato: esito.risultato,
      punteggio: esito.punteggio,
      esito: esito.esito,
      id_allegato: allegato.id_allegato,
    };
  },
};

/** Elabora un job, se presente. @returns {Promise<boolean>} true se ha trovato un job */
export async function elaboraProssimoJob() {
  const conn = await pool.getConnection();
  let job;
  try {
    job = await analisiRepository.prendiJob(conn);
  } finally {
    conn.release();
  }
  if (!job) return false;

  try {
    const esecutore = ESECUTORI[job.tipo_analisi];
    if (!esecutore) throw new Error(`Tipo di analisi non gestito: ${job.tipo_analisi}`);
    const analisi = await esecutore(job);
    if (analisi) await analisiRepository.insert(analisi);
    await analisiRepository.completaJob(job.id_job);
  } catch (err) {
    logger.warn({ err, job: job.id_job }, 'Job di analisi fallito');
    await analisiRepository.fallisciJob(job.id_job, err.message, job.tentativi + 1 < TENTATIVI_MASSIMI);
  }
  return true;
}

/** Svuota la coda (usato dai test e da `npm run worker -- --once`). */
export async function elaboraTutti() {
  let n = 0;
  while (await elaboraProssimoJob()) n++;
  return n;
}

export function avviaWorker(intervalloMs) {
  let attivo = true;
  let inCorso = Promise.resolve();
  const ciclo = async () => {
    if (!attivo) return;
    inCorso = elaboraTutti().catch((err) => logger.error({ err }, 'Errore del worker IA'));
    await inCorso;
    if (attivo) timer = setTimeout(ciclo, intervalloMs);
  };
  let timer = setTimeout(ciclo, intervalloMs);
  timer.unref?.();
  return async () => {
    attivo = false;
    clearTimeout(timer);
    await inCorso;
  };
}
