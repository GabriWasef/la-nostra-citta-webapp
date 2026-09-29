// Registro dei provider IA. Per collegare un servizio reale (API esterna o
// microservizio Python) basta aggiungere qui un provider con la stessa interfaccia.
import { env } from '../config/env.js';
import { classificazioneRegole } from './classificazione.js';
import { moderazioneRegole } from './moderazione.js';
import { visioneTecnica } from './visione.js';

const nessuno = null;

export const provider = {
  moderazione: env.AI_PROVIDER === 'regole' ? moderazioneRegole : nessuno,
  classificazione: env.AI_PROVIDER === 'regole' ? classificazioneRegole : nessuno,
  visione: env.AI_PROVIDER === 'regole' ? visioneTecnica : nessuno,
};
