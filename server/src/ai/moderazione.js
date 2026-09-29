// Filtro di moderazione del testo a regole (RF11).
// È un segnaposto deterministico: un modello NLP reale potrà sostituirlo
// implementando la stessa interfaccia { modello, analizza(testo) }.
import { normalizza, parole } from './testo.js';

// Elenchi volutamente brevi: servono a dimostrare il flusso, non a coprire la lingua.
const VOLGARITA = ['cazzo', 'cazzata', 'merda', 'stronzo', 'stronza', 'vaffanculo', 'fanculo', 'coglione', 'minchia', 'troia', 'puttana', 'bastardo'];
const INSULTI = ['idiota', 'idioti', 'imbecille', 'imbecilli', 'deficiente', 'deficienti', 'cretino', 'cretini', 'scemo', 'ladri', 'ladro', 'buffone', 'buffoni'];
const ODIO = ['negro', 'negri', 'frocio', 'froci', 'zingaro', 'zingari', 'terrone', 'terroni', 'ebreo di merda'];
const MINACCE = [
  /\b(ti|vi|lo|la|li) (ammazzo|uccido|sparo|faccio fuori|brucio)\b/,
  /\b(ammazzare|uccidere|sparare a|bruciare vivo)\b/,
  /\bbomba\b.*\b(metto|piazzo|faccio esplodere)\b/,
];

/**
 * @param {string} testo
 * @returns {{ esito: 'OK'|'DA_REVISIONARE'|'BLOCCATO', punteggio: number, motivi: string[], termini: string[] }}
 */
export function analizzaTesto(testo) {
  const norm = normalizza(testo);
  const elenco = parole(testo);
  const motivi = new Set();
  const termini = new Set();

  const cerca = (lista, motivo) => {
    for (const voce of lista) {
      const trovata = voce.includes(' ') ? norm.includes(voce) : elenco.includes(voce);
      if (trovata) {
        motivi.add(motivo);
        termini.add(voce);
      }
    }
  };
  cerca(VOLGARITA, 'LINGUAGGIO_VOLGARE');
  cerca(INSULTI, 'INSULTI');
  cerca(ODIO, 'LINGUAGGIO_ODIO');
  if (MINACCE.some((re) => re.test(norm))) motivi.add('MINACCE');

  // Spam: troppi link, caratteri ripetuti, testo tutto maiuscolo.
  const link = (testo.match(/https?:\/\/|www\./gi) ?? []).length;
  const lettere = testo.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (link > 2 || /(.)\1{9,}/.test(testo) || (lettere.length > 40 && lettere === lettere.toUpperCase())) {
    motivi.add('SPAM');
  }

  let punteggio = 0;
  if (motivi.has('LINGUAGGIO_VOLGARE')) punteggio += 0.4;
  if (motivi.has('INSULTI')) punteggio += 0.4;
  if (motivi.has('SPAM')) punteggio += 0.4;
  if (motivi.has('LINGUAGGIO_ODIO')) punteggio += 0.9;
  if (motivi.has('MINACCE')) punteggio += 0.95;
  punteggio = Math.min(1, Number(punteggio.toFixed(4)));

  const esito = punteggio >= 0.9 ? 'BLOCCATO' : punteggio > 0 ? 'DA_REVISIONARE' : 'OK';
  return { esito, punteggio, motivi: [...motivi], termini: [...termini] };
}

export const moderazioneRegole = {
  modello: 'regole-moderazione-it@1',
  analizza: async (testo) => analizzaTesto(testo),
};
