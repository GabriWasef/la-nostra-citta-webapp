// Worker della coda job_elaborazione: esegue le analisi lente fuori dalla
// richiesta HTTP. Può girare dentro il server (AI_WORKER_INTERVAL_MS > 0)
// o come processo separato (npm run worker), anche in più copie.
// Il worker registra analisi e suggerimenti: non cambia mai lo stato di una segnalazione.
import { waitUntil } from '@vercel/functions';
import { env } from '../config/env.js';
import { pool } from '../config/db.js';
import * as allegatoRepository from '../repositories/allegato.repository.js';
import * as analisiRepository from '../repositories/analisi.repository.js';
import * as catalogoRepository from '../repositories/catalogo.repository.js';
import * as segnalazioneRepository from '../repositories/segnalazione.repository.js';
import { storage } from '../storage/index.js';
import { logger } from '../utils/logger.js';
import { RinvioJob } from './errori.js';
import { esitoClassificazione, esitoModerazione, esitoPertinenza, punteggioGravita } from './esito.js';
import { provider } from './index.js';

export const TENTATIVI_MASSIMI = 3;
// Su Vercel una funzione dura al massimo 60 s (vercel.json): ci si ferma quando ne restano meno di 10.
const DURATA_INVOCAZIONE_MS = 60_000;
export const MARGINE_MS = 10_000;
// Attesa prima di riprovare un job fallito: cresce a ogni tentativo.
const ATTESA_TENTATIVO_S = 60;
// Un job IN_CORSO da più di così è stato interrotto (la funzione dura al massimo un minuto).
const MINUTI_JOB_BLOCCATO = 10;
// Tipi di analisi che dipendono da un servizio esterno: se non riescono, il comitato deve saperlo.
const TIPI_LLM = new Set(['MODERAZIONE_TESTO', 'CLASSIFICAZIONE_TESTO', 'VERIFICA_PERTINENZA']);

/** Testo e categorie da inviare al modello: mai dati dell'autore (nome, e-mail, id). */
async function contestoTesto(idSegnalazione) {
  const s = await segnalazioneRepository.findById(idSegnalazione);
  if (!s) return null; // segnalazione eliminata nel frattempo
  const [categorie, scelte] = await Promise.all([
    catalogoRepository.listCategorie(),
    segnalazioneRepository.categoriePer([idSegnalazione]),
  ]);
  return {
    testo: `${s.titolo}\n${s.descrizione}`,
    categorie,
    // Solo quelle scelte dal cittadino: quelle proposte dall'IA all'invio non sono una dichiarazione.
    dichiarate: scelte.get(idSegnalazione).filter((c) => c.origine_assegnazione !== 'IA'),
  };
}

/** Le categorie proposte dal modello si accettano solo se esistono (elenco chiuso). */
function riconduciCategorie(proposte, categorie) {
  const perNome = new Map(categorie.map((c) => [c.nome.toLowerCase(), c]));
  const viste = new Set();
  const risultato = [];
  for (const p of proposte) {
    const c = perNome.get(String(p.nome).trim().toLowerCase());
    if (!c || viste.has(c.id_categoria)) continue;
    viste.add(c.id_categoria);
    risultato.push({ id_categoria: c.id_categoria, nome: c.nome, affidabilita: p.confidenza });
  }
  return risultato.sort((a, b) => b.affidabilita - a.affidabilita).slice(0, 3);
}

/** Una sola chiamata di testo produce moderazione e classificazione (due righe in analisi_ia). */
async function analisiTesto(job, contesto, tipi) {
  if (!provider.llm) return null;
  const dati = await contestoTesto(job.id_segnalazione);
  if (!dati) return null;
  const { modello, risposta } = await provider.llm.analizzaTesto(
    { testo: dati.testo, categorie: dati.categorie.map((c) => c.nome) },
    contesto,
  );
  const righe = [];
  if (tipi.includes('MODERAZIONE_TESTO')) {
    const { esito, motivi } = esitoModerazione(risposta);
    righe.push({
      tipo_analisi: 'MODERAZIONE_TESTO',
      modello,
      risultato: { ...risposta.testo, esito_suggerito: risposta.esito_suggerito, spiegazione: risposta.spiegazione, motivi_esito: motivi },
      punteggio: punteggioGravita(risposta.testo.gravita),
      esito,
      id_segnalazione: job.id_segnalazione,
    });
  }
  if (tipi.includes('CLASSIFICAZIONE_TESTO')) {
    // Solo un suggerimento: segnalazione_categoria non si tocca, le categorie le conferma il moderatore.
    const suggerite = riconduciCategorie(risposta.categorie_suggerite, dati.categorie);
    const scelte = dati.dichiarate.map((c) => c.id_categoria);
    const { esito, motivi } = esitoClassificazione(suggerite, scelte);
    righe.push({
      tipo_analisi: 'CLASSIFICAZIONE_TESTO',
      modello,
      risultato: { suggerite, scelte_dal_cittadino: scelte, motivi_esito: motivi },
      punteggio: suggerite[0]?.affidabilita ?? null,
      esito,
      id_segnalazione: job.id_segnalazione,
    });
  }
  return righe;
}

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

  MODERAZIONE_TESTO: (job, contesto) => analisiTesto(job, contesto, ['MODERAZIONE_TESTO', 'CLASSIFICAZIONE_TESTO']),

  CLASSIFICAZIONE_TESTO: (job, contesto) => analisiTesto(job, contesto, ['CLASSIFICAZIONE_TESTO']),

  async VERIFICA_PERTINENZA(job, contesto) {
    if (!provider.llm) return null;
    const allegato = await allegatoRepository.findById(job.id_allegato);
    if (!allegato || allegato.tipo_media !== 'IMMAGINE') return null;
    const dati = await contestoTesto(job.id_segnalazione);
    if (!dati) return null;
    const { modello, risposta } = await provider.llm.verificaPertinenza(
      {
        testo: dati.testo,
        categorie: dati.categorie.map((c) => c.nome),
        categorie_dichiarate: dati.dichiarate.map((c) => c.nome),
        immagine: await storage.leggi(allegato.percorso_file),
      },
      contesto,
    );
    const { esito, motivi } = esitoPertinenza(risposta);
    return {
      tipo_analisi: 'VERIFICA_PERTINENZA',
      modello,
      risultato: { ...risposta, motivi_esito: motivi },
      punteggio: risposta.immagine.confidenza,
      esito,
      id_allegato: allegato.id_allegato,
    };
  },
};

/** Tentativi finiti per un'analisi esterna: resta traccia per il comitato, da revisionare. */
async function registraNonRiuscita(job, err) {
  if (!TIPI_LLM.has(job.tipo_analisi)) return;
  await analisiRepository.insert({
    tipo_analisi: job.tipo_analisi,
    modello: err.modello ?? 'nessun-provider-disponibile',
    risultato: { errore: 'PROVIDER_NON_DISPONIBILE', dettaglio: String(err.message).slice(0, 500), motivi_esito: ['PROVIDER_NON_DISPONIBILE'] },
    esito: 'DA_REVISIONARE',
    ...(job.id_allegato ? { id_allegato: job.id_allegato } : { id_segnalazione: job.id_segnalazione }),
  });
}

/**
 * Elabora un job, se presente.
 * @param {{scadenza?: number}} contesto scadenza (ms epoch) entro cui finire le chiamate esterne
 * @returns {Promise<boolean>} true se ha trovato un job
 */
export async function elaboraProssimoJob(contesto = {}) {
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
    const risultato = await esecutore(job, contesto);
    for (const analisi of [risultato ?? []].flat()) await analisiRepository.insert(analisi);
    await analisiRepository.completaJob(job.id_job);
  } catch (err) {
    if (err instanceof RinvioJob) {
      logger.info({ job: job.id_job, motivo: err.message }, 'Job di analisi rimandato');
      await analisiRepository.rimandaJob(job.id_job, err.message, err.ritardoMs / 1000);
      return true;
    }
    logger.warn({ err, job: job.id_job }, 'Job di analisi fallito');
    const riprova = job.tentativi + 1 < TENTATIVI_MASSIMI;
    await analisiRepository.fallisciJob(job.id_job, err.message, riprova, riprova ? ATTESA_TENTATIVO_S * (job.tentativi + 1) : 0);
    if (!riprova) await registraNonRiuscita(job, err).catch((e) => logger.error({ err: e }, 'Analisi non riuscita non registrata'));
  }
  return true;
}

/**
 * Elabora al massimo `massimo` job e si ferma quando restano meno di MARGINE_MS prima della
 * scadenza: su Vercel la funzione non deve superare maxDuration.
 * @returns {Promise<number>} job elaborati
 */
export async function elaboraTutti({ massimo = env.AI_JOB_PER_RUN, scadenza = Date.now() + DURATA_INVOCAZIONE_MS } = {}) {
  let n = 0;
  while (n < massimo && scadenza - Date.now() >= MARGINE_MS) {
    if (!(await elaboraProssimoJob({ scadenza: scadenza - MARGINE_MS }))) break;
    n++;
  }
  return n;
}

/** Svuota la coda dei job già disponibili, a blocchi (npm run worker -- --once). */
export async function svuotaCoda() {
  let totale = 0;
  for (let n; (n = await elaboraTutti()) > 0; ) totale += n;
  return totale;
}

/** Rimette in coda i job interrotti (chiamato dalla manutenzione periodica). */
export const riprendiJobBloccati = () => analisiRepository.riprendiJobBloccati(MINUTI_JOB_BLOCCATO, TENTATIVI_MASSIMI);

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
 * si eseguono subito dopo la risposta (waitUntil), entro il tempo della funzione e al massimo
 * AI_JOB_PER_RUN per volta. La manutenzione periodica recupera quelle rimaste indietro.
 * Altrove se ne occupa il worker a intervalli.
 */
export function avviaAnalisiDopoRisposta() {
  if (!env.isVercel) return;
  waitUntil(elaboraTutti().catch((err) => logger.error({ err }, 'Analisi dopo la risposta non riuscita')));
}
