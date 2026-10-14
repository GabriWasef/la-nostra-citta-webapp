// Registro dei provider IA.
// - regole: filtri a regole nella richiesta e controllo tecnico delle immagini nel worker;
// - mistral: gli stessi filtri a regole nella richiesta (la richiesta non dipende mai da un servizio
//   esterno) più un modello linguistico, usato solo dal worker, con eventuale fallback (Groq);
// - nessuno: nessuna analisi automatica.
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { MODELLO_AUTENTICITA } from './autenticita.js';
import { classificazioneRegole } from './classificazione.js';
import { moderazioneRegole } from './moderazione.js';
import { creaLlmDaConfig } from './providers/index.js';
import { creaLimitatori } from './providers/limiti.js';
import { visioneTecnica } from './visione.js';

/** @param {object} cfg variabili d'ambiente validate @param {object} [dipendenze] fetch e limitatori (test) */
export function creaProvider(cfg, dipendenze = {}) {
  const attivi = cfg.AI_PROVIDER !== 'nessuno';
  return {
    moderazione: attivi ? moderazioneRegole : null,
    classificazione: attivi ? classificazioneRegole : null,
    visione: attivi ? visioneTecnica : null,
    // Verifica di autenticità delle foto (EXIF, foto riusate): deterministica, nessun servizio esterno.
    autenticita: attivi ? { modello: MODELLO_AUTENTICITA } : null,
    // Modello linguistico usato dal worker (moderazione, classificazione, pertinenza delle immagini):
    // { analizzaTesto(dati, contesto), verificaPertinenza(dati, contesto) } -> { modello, risposta }.
    // Limiti di richieste (AI_MAX_RPM/RPD) contati nel database, condivisi tra le istanze.
    llm: creaLlmDaConfig(cfg, { limitatori: creaLimitatori(cfg, pool), ...dipendenze }),
  };
}

export const provider = creaProvider(env);
