// Classificazione tematica a parole chiave (RF12).
// Segnaposto di un modello NLP: restituisce categorie suggerite con un
// punteggio di affidabilità, che il moderatore conferma o corregge.
import { normalizza, parole } from './testo.js';

// Radici delle parole (confronto per prefisso), per nome di categoria.
const PAROLE_CHIAVE = {
  'Ambiente': ['inquin', 'smog', 'aria', 'rumor', 'amiant', 'discaric', 'ambient', 'polver', 'odor', 'puzz'],
  'Mobilità urbana': ['autobus', 'bus', 'tram', 'metro', 'metropolitan', 'ciclabil', 'bici', 'monopattin', 'trasport', 'fermat', 'pendolar', 'mezzi'],
  'Politiche giovanili': ['giovan', 'ragazz', 'student', 'scuol', 'universit', 'aggregazion', 'oratori', 'adolescent', 'sport'],
  'Decoro urbano': ['rifiut', 'sporc', 'graffit', 'imbrattat', 'degrad', 'abbandon', 'cestin', 'spazzatur', 'escrement', 'deiezion'],
  'Sicurezza': ['sicurezz', 'spacci', 'furt', 'rapin', 'aggression', 'riss', 'vandal', 'movida', 'schiamazz', 'pericol', 'molest'],
  'Illuminazione': ['lampion', 'illumin', 'luce', 'luci', 'bui', 'lampad'],
  'Manutenzione stradale': ['buca', 'buche', 'asfalt', 'marciapied', 'tombin', 'dissest', 'crep', 'pavimentazion'],
  'Verde pubblico': ['parco', 'parchi', 'giardin', 'albero', 'alberi', 'aiuol', 'verde', 'erba', 'potatur', 'siep', 'prato'],
  'Viabilità': ['semafor', 'segnalet', 'incroc', 'parchegg', 'strisce', 'pedonal', 'rotond', 'sosta', 'doppia fila', 'traffic', 'velocit'],
  'Rischio idrogeologico': ['allag', 'esondaz', 'frana', 'alluvion', 'seveso', 'lambro', 'fognatur', 'acqua', 'pioggia', 'idrogeolog'],
};

/**
 * @param {string} testo titolo + descrizione
 * @param {{id_categoria: number, nome: string}[]} categorie categorie esistenti nel database
 * @returns {{id_categoria: number, nome: string, affidabilita: number, corrispondenze: string[]}[]}
 */
export function classificaTesto(testo, categorie) {
  const elenco = parole(testo);
  const norm = normalizza(testo);
  const risultati = [];

  for (const categoria of categorie) {
    const radici = PAROLE_CHIAVE[categoria.nome];
    if (!radici) continue;
    const trovate = radici.filter((r) =>
      r.includes(' ') ? norm.includes(r) : elenco.some((p) => p.startsWith(r)),
    );
    if (trovate.length) {
      risultati.push({
        id_categoria: categoria.id_categoria,
        nome: categoria.nome,
        affidabilita: Number(Math.min(0.95, 0.45 + 0.15 * trovate.length).toFixed(4)),
        corrispondenze: trovate,
      });
    }
  }
  return risultati.sort((a, b) => b.affidabilita - a.affidabilita).slice(0, 3);
}

export const classificazioneRegole = {
  modello: 'regole-classificazione-it@1',
  classifica: async (testo, categorie) => classificaTesto(testo, categorie),
};
