// Regole di esito delle analisi IA. Nessuna regola cambia lo stato di una segnalazione.
// - BLOCCATO: testo con un motivo grave (minaccia, odio, insulto grave, contenuto sessuale), oppure
//   spam, testo privo di senso o non pertinente con confidenza >= AI_SOGLIA_AUTO_NASCONDI;
//   immagini inappropriate (solo suggerimento: l'auto-nascondi riguarda la moderazione del testo);
// - DA_REVISIONARE: tutto il resto che non è a posto (DUBBIO, confidenza sotto soglia, incongruenze,
//   sospetti di falsità, provider non disponibile);
// - OK: tutti i controlli superati.
// Solo un BLOCCATO della moderazione del testo fatta dal modello nasconde la segnalazione, e solo con
// AI_AUTO_NASCONDI=true (ai/worker.js). Il sospetto che una foto sia generata o falsa non produce mai BLOCCATO.
import { MOTIVI_GRAVI, MOTIVI_NON_OPPORTUNI } from './schemi.js';

export const CONFIDENZA_MINIMA = 0.7;
// Valore predefinito di AI_SOGLIA_AUTO_NASCONDI.
export const SOGLIA_AUTO_NASCONDI = 0.9;
// Il segnale "sembra generata o montata" del modello pesa solo se dichiarato con almeno questa confidenza.
export const CONFIDENZA_SEGNALE_AUTENTICITA = 0.5;

const GRAVITA = ['OK', 'DA_REVISIONARE', 'BLOCCATO'];
export const peggiore = (a, b) => (GRAVITA.indexOf(a) >= GRAVITA.indexOf(b) ? a : b);

/** Punteggio di rischio (0-1) dalla gravità dichiarata dal modello. */
export const punteggioGravita = (gravita) => ({ nessuna: 0, bassa: 0.5, alta: 1 })[gravita] ?? null;

/**
 * Moderazione del testo fatta dal modello.
 * @param {{testo: {accettabile: boolean, gravita: string, motivi: string[]}, motivo: string|null, confidenza: number, esito_suggerito: string}} r
 * @param {{soglia?: number}} [opzioni] soglia: AI_SOGLIA_AUTO_NASCONDI
 */
export function esitoModerazione(r, { soglia = SOGLIA_AUTO_NASCONDI } = {}) {
  const { motivo, confidenza } = r;
  if (MOTIVI_GRAVI.includes(motivo)) return { esito: 'BLOCCATO', motivi: [motivo] };
  if (MOTIVI_NON_OPPORTUNI.includes(motivo)) {
    return confidenza >= soglia ? { esito: 'BLOCCATO', motivi: [motivo] } : { esito: 'DA_REVISIONARE', motivi: [motivo, 'CONFIDENZA_BASSA'] };
  }
  if (motivo === 'DUBBIO') return { esito: 'DA_REVISIONARE', motivi: ['DUBBIO'] };
  // Nessun motivo: la gravità dichiarata dal modello porta al più a una verifica del comitato.
  const { accettabile, gravita } = r.testo;
  const motivi = [];
  if (!accettabile && gravita === 'alta') motivi.push('TESTO_GRAVE');
  else if (!accettabile) motivi.push('TESTO_NON_ACCETTABILE');
  else if (gravita !== 'nessuna') motivi.push('TESTO_DA_VERIFICARE');
  // Un BLOCCATO del modello senza gravità alta resta un dubbio da verificare, non un blocco.
  if (r.esito_suggerito !== 'OK') motivi.push('ESITO_SUGGERITO_DAL_MODELLO');
  return { esito: motivi.length ? 'DA_REVISIONARE' : 'OK', motivi };
}

/**
 * Pertinenza di un'immagine rispetto a testo e categorie (il giudizio sul testo è nella moderazione).
 * @param {object} r risposta del modello (schema in ai/schemi.js)
 */
export function esitoPertinenza(r) {
  const { immagine, segnale_autenticita: autenticita } = r;
  const motivi = [];
  if (immagine.inappropriata) motivi.push('IMMAGINE_INAPPROPRIATA');
  if (immagine.corrisponde_al_testo === false) motivi.push('IMMAGINE_NON_CORRISPONDE_AL_TESTO');
  if (immagine.corrisponde_al_testo === null) motivi.push('PERTINENZA_NON_VALUTABILE');
  if (immagine.corrisponde_alla_categoria === false) motivi.push('IMMAGINE_NON_CORRISPONDE_ALLA_CATEGORIA');
  if (immagine.confidenza < CONFIDENZA_MINIMA) motivi.push('CONFIDENZA_BASSA');
  if (autenticita?.sembra_generata_o_montata && autenticita.confidenza >= CONFIDENZA_SEGNALE_AUTENTICITA) {
    motivi.push('SEGNALE_AUTENTICITA');
  }
  if (r.esito_suggerito !== 'OK' && !motivi.length) motivi.push('ESITO_SUGGERITO_DAL_MODELLO');
  if (immagine.inappropriata) return { esito: 'BLOCCATO', motivi };
  return { esito: motivi.length ? 'DA_REVISIONARE' : 'OK', motivi };
}

/**
 * Categorie proposte dal modello confrontate con quelle scelte dal cittadino.
 * @param {{id_categoria: number}[]} suggerite già ricondotte alle categorie esistenti
 * @param {number[]} scelte id delle categorie scelte dal cittadino
 */
export function esitoClassificazione(suggerite, scelte) {
  if (!scelte.length) return { esito: 'DA_REVISIONARE', motivi: ['CATEGORIE_DA_CONFERMARE'] };
  if (!suggerite.length) return { esito: 'DA_REVISIONARE', motivi: ['NESSUNA_CATEGORIA_SUGGERITA'] };
  if (!scelte.includes(suggerite[0].id_categoria)) return { esito: 'DA_REVISIONARE', motivi: ['CATEGORIA_DIVERSA_DAL_SUGGERIMENTO'] };
  return { esito: 'OK', motivi: [] };
}

const motiviDi = (a) => {
  const r = a.risultato ?? {};
  return r.motivi_esito ?? r.motivi ?? r.problemi ?? [];
};

/**
 * Esito complessivo di una segnalazione, mostrato al comitato.
 * Le analisi respinte o corrette dal comitato non contano più; quelle confermate sì.
 * @param {{analisi: object[], job?: {stato: string}[]}} dati
 * @returns {{esito: string|null, motivi: string[], da_revisionare: number, analisi_in_corso: number, analisi_non_riuscite: number}}
 */
export function riepilogo({ analisi, job = [] }) {
  let esito = null;
  const motivi = new Set();
  let daRevisionare = 0;
  for (const a of analisi) {
    if (!a.esito || a.esito_revisione === 'RESPINTA' || a.esito_revisione === 'CORRETTA') continue;
    // Le verifiche di autenticità non bloccano mai, qualunque cosa sia registrata.
    const e = a.tipo_analisi === 'VERIFICA_AUTENTICITA' && a.esito === 'BLOCCATO' ? 'DA_REVISIONARE' : a.esito;
    esito = esito ? peggiore(esito, e) : e;
    if (e !== 'OK') {
      for (const m of motiviDi(a)) motivi.add(m);
      if (!a.esito_revisione) daRevisionare++;
    }
  }
  const inCorso = job.filter((j) => j.stato === 'IN_CODA' || j.stato === 'IN_CORSO').length;
  const nonRiusciti = job.filter((j) => j.stato === 'ERRORE').length;
  if (inCorso) motivi.add('ANALISI_IN_CORSO');
  if (nonRiusciti) motivi.add('PROVIDER_NON_DISPONIBILE');
  // Finché mancano dei controlli non si può dire che tutto sia a posto.
  if (inCorso || nonRiusciti) esito = esito ? peggiore(esito, 'DA_REVISIONARE') : 'DA_REVISIONARE';
  return { esito, motivi: [...motivi], da_revisionare: daRevisionare, analisi_in_corso: inCorso, analisi_non_riuscite: nonRiusciti };
}
