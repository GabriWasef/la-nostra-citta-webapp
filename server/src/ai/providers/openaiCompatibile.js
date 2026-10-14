// Adapter unico per le API "chat completions" compatibili con OpenAI (Mistral, Groq).
// fetch nativo, nessun SDK: cambiano solo indirizzo, chiave e modello.
// - timeout con AbortController, entro la scadenza dell'invocazione;
// - nuovi tentativi con attesa esponenziale su 429, 5xx, timeout ed errori di rete;
// - risposta solo JSON, validata con Zod: se non è valida si chiede una sola nuova risposta.
// La chiave API non compare mai nei messaggi di errore.
import { ErroreProvider, RinvioJob } from '../errori.js';

const ATTESA_BASE_MS = 1_000;
// Sotto questo tempo residuo non si avvia una chiamata: meglio rimandare il job.
export const TEMPO_MINIMO_CHIAMATA_MS = 2_000;
const attendiDefault = (ms) => new Promise((r) => setTimeout(r, ms));

/** Toglie eventuali blocchi di ragionamento e recinti markdown attorno al JSON. */
function estraiJson(contenuto) {
  let t = String(contenuto ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const recinto = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (recinto) t = recinto[1];
  return JSON.parse(t);
}

/**
 * @param {object} opzioni
 * @param {string} opzioni.nome nome del provider (es. "mistral"): compare nel campo modello delle analisi
 * @param {string} opzioni.baseURL es. https://api.mistral.ai/v1
 * @param {string} opzioni.apiKey
 * @param {string} opzioni.modello
 * @param {number} [opzioni.timeoutMs]
 * @param {number} [opzioni.maxRetries] tentativi aggiuntivi su 429, 5xx e timeout
 * @param {typeof fetch} [opzioni.fetch] iniettabile per i test
 * @param {(ms: number) => Promise<void>} [opzioni.attendi] iniettabile per i test
 * @param {{prenota(): Promise<{ok: boolean, ritardoMs?: number}>}} [opzioni.limitatore] limite di richieste
 */
export function creaProviderOpenAI({
  nome,
  baseURL,
  apiKey,
  modello,
  timeoutMs = 15_000,
  maxRetries = 2,
  fetch = globalThis.fetch,
  attendi = attendiDefault,
  limitatore = null,
}) {
  const etichetta = `${nome}:${modello}`;
  const url = `${baseURL.replace(/\/+$/, '')}/chat/completions`;
  // Qualunque testo proveniente dall'esterno viene ripulito dalla chiave prima di finire in un errore.
  const pulisci = (testo) => (apiKey ? String(testo).replaceAll(apiKey, '[chiave]') : String(testo));
  const errore = (messaggio, dettagli = {}) => new ErroreProvider(pulisci(`${etichetta}: ${messaggio}`), { modello: etichetta, ...dettagli });

  /** Una richiesta HTTP. @returns {Promise<string>} contenuto del messaggio di risposta */
  async function richiesta(messaggi, scadenza) {
    const residuo = scadenza - Date.now();
    if (residuo < TEMPO_MINIMO_CHIAMATA_MS) throw new RinvioJob(`${etichetta}: tempo dell'invocazione esaurito`, 1_000);
    if (limitatore) {
      const p = await limitatore.prenota();
      // Limite locale (AI_MAX_RPM/RPD): non si ritenta, si passa al fallback o si rimanda il job.
      if (!p.ok) throw errore(`limite configurato di richieste raggiunto (${p.limite ?? 'locale'})`, { stato: 'LIMITE_LOCALE', limite: true, ritardoMs: p.ritardoMs });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, residuo));
    let risposta;
    try {
      risposta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: modello,
          messages: messaggi,
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: 1000,
        }),
        signal: controller.signal,
      });
      if (risposta.ok) {
        const corpo = await risposta.json();
        return corpo?.choices?.[0]?.message?.content ?? '';
      }
      // Il corpo dell'errore serve per i log, ma si tiene corto.
      const dettaglio = (await risposta.text().catch(() => '')).slice(0, 300);
      const stato = risposta.status;
      if (stato === 429) {
        const secondi = Number(risposta.headers.get('retry-after'));
        throw errore(`limite di richieste del provider (429) ${dettaglio}`, {
          stato,
          limite: true,
          ritardoMs: Number.isFinite(secondi) && secondi > 0 ? secondi * 1000 : undefined,
        });
      }
      throw errore(`errore HTTP ${stato} ${dettaglio}`, { stato });
    } catch (err) {
      if (err instanceof ErroreProvider || err instanceof RinvioJob) throw err;
      if (controller.signal.aborted) throw errore(`nessuna risposta entro ${Math.min(timeoutMs, residuo)} ms`, { stato: 'TIMEOUT' });
      throw errore(`provider non raggiungibile (${err.message})`, { stato: 'RETE' });
    } finally {
      clearTimeout(timer);
    }
  }

  const ripetibile = (err) =>
    err instanceof ErroreProvider && (err.stato === 429 || err.stato === 'TIMEOUT' || err.stato === 'RETE' || err.stato >= 500);

  /** Richiesta con nuovi tentativi ed attesa esponenziale (o quella indicata dal provider). */
  async function conTentativi(messaggi, scadenza) {
    for (let tentativo = 0; ; tentativo++) {
      try {
        return await richiesta(messaggi, scadenza);
      } catch (err) {
        if (!ripetibile(err) || tentativo >= maxRetries) throw err;
        const attesa = err.ritardoMs ?? ATTESA_BASE_MS * 2 ** tentativo;
        // Se l'attesa non lascia tempo per un'altra chiamata, si rinuncia subito (fallback o rinvio).
        if (Date.now() + attesa + TEMPO_MINIMO_CHIAMATA_MS > scadenza) throw err;
        await attendi(attesa);
      }
    }
  }

  return {
    nome,
    modello: etichetta,

    /**
     * @param {object[]} messaggi formato chat completions
     * @param {import('zod').ZodType} schema
     * @param {{scadenza?: number}} [contesto] ms epoch entro cui finire
     * @returns {Promise<{modello: string, dati: any}>}
     */
    async completaJson(messaggi, schema, { scadenza = Date.now() + 50_000 } = {}) {
      let ultimoErrore;
      // Una risposta non valida dà diritto a una sola nuova richiesta.
      for (let prova = 0; prova < 2; prova++) {
        const contenuto = await conTentativi(messaggi, scadenza);
        let json;
        try {
          json = estraiJson(contenuto);
        } catch {
          ultimoErrore = 'la risposta non è JSON';
          continue;
        }
        const esito = schema.safeParse(json);
        if (esito.success) return { modello: etichetta, dati: esito.data };
        ultimoErrore = `la risposta non rispetta lo schema (${esito.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')})`;
      }
      throw errore(`risposta non valida: ${ultimoErrore}`, { stato: 'RISPOSTA_NON_VALIDA' });
    },
  };
}
