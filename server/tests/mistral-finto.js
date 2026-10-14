// fetch finto per le API chat completions (Mistral, Groq): nessuna rete nei test.
// Ogni chiamata consuma il passo successivo della sequenza; le richieste ricevute restano in `chiamate`.

/** Risposta 200 con il JSON indicato come contenuto del messaggio. */
export const json = (oggetto) => ({ stato: 200, contenuto: JSON.stringify(oggetto) });
/** Risposta 200 con un contenuto testuale qualsiasi (per esempio JSON non valido). */
export const testo = (contenuto) => ({ stato: 200, contenuto });
/** Errore HTTP, con eventuale Retry-After in secondi. */
export const errore = (stato, { retryAfter, corpo = '{"message":"errore simulato"}' } = {}) => ({ stato, retryAfter, corpo });
/** Non risponde mai: termina solo quando la richiesta viene interrotta (timeout). */
export const silenzio = () => ({ silenzio: true });
/** Errore di rete (DNS, connessione rifiutata). */
export const rete = () => ({ rete: true });

/**
 * @param {object[]} sequenza passi; l'ultimo si ripete se le chiamate sono di più
 * @returns {typeof fetch & {chiamate: {url: string, headers: object, body: object}[]}}
 */
export function creaFetchFinto(sequenza) {
  const passi = [...sequenza];
  const chiamate = [];
  const fetchFinto = async (url, opzioni) => {
    chiamate.push({ url, headers: opzioni.headers, body: JSON.parse(opzioni.body) });
    const passo = passi.length > 1 ? passi.shift() : passi[0];
    if (passo.rete) throw new TypeError('fetch failed');
    if (passo.silenzio) {
      return new Promise((_, rifiuta) => {
        opzioni.signal.addEventListener('abort', () => rifiuta(Object.assign(new Error('Interrotta'), { name: 'AbortError' })));
      });
    }
    if (passo.stato !== 200) {
      return new Response(passo.corpo, {
        status: passo.stato,
        headers: passo.retryAfter !== undefined ? { 'retry-after': String(passo.retryAfter) } : {},
      });
    }
    return Response.json({
      id: 'cmpl-finto',
      model: chiamate.at(-1).body.model,
      choices: [{ index: 0, message: { role: 'assistant', content: passo.contenuto }, finish_reason: 'stop' }],
    });
  };
  fetchFinto.chiamate = chiamate;
  return fetchFinto;
}

/** Risposte valide di esempio. */
export const RISPOSTA_TESTO = {
  testo: { accettabile: true, gravita: 'nessuna', motivi: [] },
  categorie_suggerite: [{ nome: 'Manutenzione stradale', confidenza: 0.92 }],
  esito_suggerito: 'OK',
  spiegazione: 'Segnalazione civile di una buca nella strada.',
};

export const RISPOSTA_PERTINENZA = {
  testo: { accettabile: true, gravita: 'nessuna', motivi: [] },
  immagine: {
    corrisponde_al_testo: true,
    corrisponde_alla_categoria: true,
    categoria_suggerita: 'Manutenzione stradale',
    inappropriata: false,
    confidenza: 0.88,
    osservato: 'Asfalto danneggiato con una buca.',
  },
  segnale_autenticita: { sembra_generata_o_montata: false, confidenza: 0.05 },
  esito_suggerito: 'OK',
  spiegazione: 'La foto mostra la buca descritta.',
};
