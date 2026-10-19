// Modello linguistico usato dal worker: provider primario con eventuale fallback.
// Interfaccia: { modello, analizzaTesto(dati, contesto), verificaPertinenza(dati, contesto) }
// -> { modello effettivamente usato, risposta validata }.
import { PROVIDER_ESTERNI } from '../../config/env.js';
import { ErroreProvider, RinvioJob } from '../errori.js';
import { dataUriPerModello } from '../immagine.js';
import { messaggiPertinenza, messaggiTesto } from '../prompt.js';
import { schemaPertinenza, schemaTesto } from '../schemi.js';
import { creaProviderOpenAI } from './openaiCompatibile.js';

// Indirizzo, chiave, modello e response_format di ciascun servizio, dalle variabili d'ambiente.
// Cloudflare Workers AI riceve lo schema della risposta (json_schema); gli altri il solo json_object.
export const PROVIDER = {
  mistral: (cfg) => ({ baseURL: 'https://api.mistral.ai/v1', apiKey: cfg.MISTRAL_API_KEY, modello: cfg.MISTRAL_MODEL }),
  cloudflare: (cfg) => ({
    baseURL: `https://api.cloudflare.com/client/v4/accounts/${cfg.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
    apiKey: cfg.CLOUDFLARE_API_TOKEN,
    modello: cfg.CLOUDFLARE_MODEL,
    formato: 'json_schema',
  }),
  groq: (cfg) => ({ baseURL: 'https://api.groq.com/openai/v1', apiKey: cfg.GROQ_API_KEY, modello: cfg.GROQ_MODEL }),
};

// Se tutti i provider hanno raggiunto il limite senza indicare quando riprovare.
const RINVIO_PREDEFINITO_MS = 60_000;

/**
 * @param {ReturnType<typeof creaProviderOpenAI>[]} catena primario seguito dai fallback
 */
export function creaLlm(catena) {
  async function chiedi(messaggi, schema, contesto) {
    const errori = [];
    for (const p of catena) {
      try {
        return await p.completaJson(messaggi, schema, contesto);
      } catch (err) {
        // Tempo dell'invocazione finito: nessun fallback avrebbe tempo, si rimanda il job.
        if (err instanceof RinvioJob) throw err;
        errori.push(err);
      }
    }
    // Solo limiti di richieste: non è un errore, il job si rimanda senza consumare tentativi.
    if (errori.every((e) => e instanceof ErroreProvider && e.limite)) {
      const ritardi = errori.map((e) => e.ritardoMs).filter(Number.isFinite);
      throw new RinvioJob(`Limite di richieste raggiunto (${errori.map((e) => e.modello).join(', ')})`, ritardi.length ? Math.min(...ritardi) : RINVIO_PREDEFINITO_MS);
    }
    throw new ErroreProvider(errori.map((e) => e.message).join(' | '), {
      modello: errori.map((e) => e.modello).filter(Boolean).join(' → '),
    });
  }

  return {
    modello: catena.map((p) => p.modello).join(' → '),

    async analizzaTesto({ testo, categorie }, contesto = {}) {
      const { modello, dati } = await chiedi(messaggiTesto({ testo, categorie }), schemaTesto, contesto);
      return { modello, risposta: dati };
    },

    async verificaPertinenza({ testo, categorie, categorie_dichiarate = [], immagine }, contesto = {}) {
      const immagineDataUri = await dataUriPerModello(immagine);
      const { modello, dati } = await chiedi(
        messaggiPertinenza({ testo, categorie, categorie_dichiarate, immagineDataUri }),
        schemaPertinenza,
        contesto,
      );
      // Elenco chiuso: una categoria inventata dal modello non si propone al comitato.
      if (dati.immagine.categoria_suggerita !== null && !categorie.includes(dati.immagine.categoria_suggerita)) {
        dati.immagine.categoria_suggerita = null;
      }
      return { modello, risposta: dati };
    },
  };
}

/**
 * Costruisce il modello linguistico dalla configurazione (null se AI_PROVIDER non è un provider esterno).
 * Livelli: AI_PROVIDER (mistral o cloudflare), poi AI_FALLBACK_PROVIDER se è un servizio (groq o cloudflare),
 * poi le regole: le analisi a regole fatte nella richiesta restano, e il job viene ritentato più tardi.
 * @param {object} cfg variabili d'ambiente validate (config/env.js)
 * @param {{fetch?: typeof fetch, attendi?: Function, limitatori?: Record<string, object>}} [dipendenze]
 */
export function creaLlmDaConfig(cfg, { fetch, attendi, limitatori = {} } = {}) {
  if (!PROVIDER_ESTERNI.includes(cfg.AI_PROVIDER)) return null;
  const comune = { timeoutMs: cfg.AI_TIMEOUT_MS, maxRetries: cfg.AI_MAX_RETRIES, ...(fetch && { fetch }), ...(attendi && { attendi }) };
  const nomi = [cfg.AI_PROVIDER];
  if (PROVIDER[cfg.AI_FALLBACK_PROVIDER] && cfg.AI_FALLBACK_PROVIDER !== cfg.AI_PROVIDER) nomi.push(cfg.AI_FALLBACK_PROVIDER);
  return creaLlm(nomi.map((nome) => creaProviderOpenAI({ nome, ...PROVIDER[nome](cfg), limitatore: limitatori[nome], ...comune })));
}
