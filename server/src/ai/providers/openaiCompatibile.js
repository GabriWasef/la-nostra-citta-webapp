// Adapter unico per le API "chat completions" compatibili con OpenAI (Mistral, Cloudflare Workers AI, Groq).
// fetch nativo, nessun SDK: cambiano solo indirizzo, chiave e modello.
// - timeout con AbortController, entro la scadenza dell'invocazione;
// - nuovi tentativi con attesa esponenziale su 429, 5xx, timeout ed errori di rete;
// - risposta solo JSON, validata con Zod: se non è valida il provider ha fallito e si passa al livello successivo;
// - token consumati (campo usage della risposta) aggiunti alla quota del giorno (tabella ai_quota).
// La chiave API non compare mai nei messaggi di errore.
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import { ErroreProvider, RinvioJob } from '../errori.js';

const ATTESA_BASE_MS = 1_000;
// Sotto questo tempo residuo non si avvia una chiamata: meglio rimandare il job.
export const TEMPO_MINIMO_CHIAMATA_MS = 2_000;
const attendiDefault = (ms) => new Promise((r) => setTimeout(r, ms));
// Errore di Cloudflare quando il modello non riesce a rispettare lo schema JSON richiesto.
const JSON_MODE_NON_RISPETTATO = /JSON Mode couldn.t be met/i;

/**
 * response_format della richiesta: json_object (Mistral, Groq) oppure json_schema, con lo schema Zod
 * della risposta convertito in JSON Schema (Cloudflare Workers AI).
 */
export function formatoRisposta(tipo, schema) {
  if (tipo !== 'json_schema') return { type: 'json_object' };
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema);
  return { type: 'json_schema', json_schema: { name: 'risposta', schema: jsonSchema } };
}

/** Toglie eventuali blocchi di ragionamento e recinti markdown attorno al JSON. */
function estraiJson(contenuto) {
  let t = String(contenuto ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const recinto = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (recinto) t = recinto[1];
  return JSON.parse(t);
}

/**
 * @param {object} opzioni
 * @param {string} opzioni.nome nome del provider (es. "cloudflare"): compare nel campo modello delle analisi
 * @param {string} opzioni.baseURL es. https://api.mistral.ai/v1
 * @param {string} opzioni.apiKey
 * @param {string} opzioni.modello
 * @param {number} [opzioni.timeoutMs]
 * @param {number} [opzioni.maxRetries] tentativi aggiuntivi su 429, 5xx e timeout
 * @param {typeof fetch} [opzioni.fetch] iniettabile per i test
 * @param {(ms: number) => Promise<void>} [opzioni.attendi] iniettabile per i test
 * @param {{prenota(): Promise<{ok: boolean, ritardoMs?: number, giorno?: string}>, registraToken?: Function}} [opzioni.limitatore]
 *   limiti di richieste e token
 * @param {'json_object'|'json_schema'} [opzioni.formato] response_format chiesto al provider
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
  formato = 'json_object',
}) {
  const etichetta = `${nome}:${modello}`;
  const url = `${baseURL.replace(/\/+$/, '')}/chat/completions`;
  // Qualunque testo proveniente dall'esterno viene ripulito dalla chiave prima di finire in un errore.
  const pulisci = (testo) => (apiKey ? String(testo).replaceAll(apiKey, '[chiave]') : String(testo));
  const errore = (messaggio, dettagli = {}) => new ErroreProvider(pulisci(`${etichetta}: ${messaggio}`), { modello: etichetta, ...dettagli });

  /** Token consumati nella quota del giorno: un errore di conteggio non fa fallire l'analisi. */
  async function registraToken(token, giorno) {
    if (!limitatore?.registraToken || !(Number(token) > 0)) return;
    await limitatore.registraToken(Number(token), giorno).catch((err) => logger.warn({ err: err.message, provider: nome }, 'Token non registrati nella quota'));
  }

  /** Una richiesta HTTP. @returns {Promise<string>} contenuto del messaggio di risposta */
  async function richiesta(messaggi, rispostaFormato, scadenza) {
    const residuo = scadenza - Date.now();
    if (residuo < TEMPO_MINIMO_CHIAMATA_MS) throw new RinvioJob(`${etichetta}: tempo dell'invocazione esaurito`, 1_000);
    let prenotazione = null;
    if (limitatore) {
      prenotazione = await limitatore.prenota();
      // Limite locale (richieste o token): non si ritenta, si passa al fallback o si rimanda il job.
      if (!prenotazione.ok) {
        throw errore(`limite configurato raggiunto (${prenotazione.limite ?? 'locale'})`, { stato: 'LIMITE_LOCALE', limite: true, ritardoMs: prenotazione.ritardoMs });
      }
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
          response_format: rispostaFormato,
          temperature: 0,
          max_tokens: 1000,
        }),
        signal: controller.signal,
      });
      if (risposta.ok) {
        const corpo = await risposta.json();
        await registraToken(corpo?.usage?.total_tokens, prenotazione?.giorno);
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
      // Schema non rispettabile dal modello: come una risposta non valida, non si ritenta.
      if (JSON_MODE_NON_RISPETTATO.test(dettaglio)) throw errore(`risposta non valida: ${dettaglio}`, { stato: 'RISPOSTA_NON_VALIDA' });
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
  async function conTentativi(messaggi, rispostaFormato, scadenza) {
    for (let tentativo = 0; ; tentativo++) {
      try {
        return await richiesta(messaggi, rispostaFormato, scadenza);
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
      const contenuto = await conTentativi(messaggi, formatoRisposta(formato, schema), scadenza);
      // Una risposta non valida non si richiede allo stesso provider: si passa al livello successivo.
      let json;
      try {
        json = estraiJson(contenuto);
      } catch {
        throw errore('risposta non valida: la risposta non è JSON', { stato: 'RISPOSTA_NON_VALIDA' });
      }
      const esito = schema.safeParse(json);
      if (esito.success) return { modello: etichetta, dati: esito.data };
      const problemi = esito.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw errore(`risposta non valida: la risposta non rispetta lo schema (${problemi})`, { stato: 'RISPOSTA_NON_VALIDA' });
    },
  };
}
