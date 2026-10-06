// Worker della coda job_elaborazione: esegue le analisi lente fuori dalla
// richiesta HTTP. Può girare dentro il server (AI_WORKER_INTERVAL_MS > 0)
// o come processo separato (npm run worker), anche in più copie.
import { waitUntil } from '@vercel/functions';
import { env } from '../config/env.js';
import { pool } from '../config/db.js';
import * as allegatoRepository from '../repositories/allegato.repository.js';
import * as analisiRepository from '../repositories/analisi.repository.js';
import { storage } from '../storage/index.js';
import { logger } from '../utils/logger.js';
import { provider } from './index.js';

const TENTATIVI_MASSIMI = 3;

const ESECUTORI = {
  async ANALISI_IMMAGINE(job) {
    if (!provider.visione) return null;
    const allegato = await allegatoRepository.findById(job.id_allegato);
    if (!allegato) return null; // allegato eliminato nel frattempo
    // L'immagine si legge dall'archivio (disco locale o Vercel Blob).
    const esito = await provider.visione.analizza(await storage.leggi(allegato.percorso_file));
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

/**
 * Su Vercel nessun processo resta acceso tra una richiesta e l'altra: le analisi in coda
 * si eseguono subito dopo la risposta (waitUntil). La manutenzione periodica recupera
 * quelle eventualmente rimaste indietro. Altrove se ne occupa il worker a intervalli.
 */
export function avviaAnalisiDopoRisposta() {
  if (!env.isVercel) return;
  waitUntil(elaboraTutti().catch((err) => logger.error({ err }, 'Analisi dopo la risposta non riuscita')));
}
