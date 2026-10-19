// Schemi delle risposte JSON dei modelli linguistici. Una risposta che non li rispetta
// non viene mai salvata: si passa al provider successivo (fallback), poi alle regole.
import { z } from 'zod';

const testoBreve = (max) => z.string().max(max);
const confidenza = z.number().min(0).max(1);
const esitoSuggerito = z.enum(['OK', 'DA_REVISIONARE', 'BLOCCATO']);

const valutazioneTesto = z.object({
  accettabile: z.boolean(),
  gravita: z.enum(['nessuna', 'bassa', 'alta']),
  motivi: z.array(testoBreve(200)).max(10),
});

// Motivi della moderazione automatica (elenco chiuso). null = nessun problema.
// - gravi: la segnalazione si nasconde sempre;
// - non sensate o non opportune: si nasconde solo con confidenza >= AI_SOGLIA_AUTO_NASCONDI;
// - DUBBIO: ogni altro caso, va al comitato.
export const MOTIVI_GRAVI = ['MINACCIA', 'ODIO', 'INSULTO_GRAVE', 'CONTENUTO_SESSUALE'];
export const MOTIVI_NON_OPPORTUNI = ['SPAM_PUBBLICITA', 'NON_SENSATA', 'NON_PERTINENTE'];
export const MOTIVI_MODERAZIONE = [...MOTIVI_GRAVI, ...MOTIVI_NON_OPPORTUNI, 'DUBBIO'];

/** Moderazione e classificazione del testo (chiamata di solo testo). */
export const schemaTesto = z.object({
  testo: valutazioneTesto,
  motivo: z.enum(MOTIVI_MODERAZIONE).nullable(),
  confidenza,
  categorie_suggerite: z.array(z.object({ nome: testoBreve(100), confidenza })).max(5),
  esito_suggerito: esitoSuggerito,
  spiegazione: testoBreve(2000),
});

/** Pertinenza di un'immagine rispetto a testo e categorie (schema del piano). */
export const schemaPertinenza = z.object({
  testo: valutazioneTesto,
  immagine: z.object({
    corrisponde_al_testo: z.boolean().nullable(),
    corrisponde_alla_categoria: z.boolean().nullable(),
    categoria_suggerita: testoBreve(100).nullable(),
    inappropriata: z.boolean(),
    confidenza,
    osservato: testoBreve(1000),
  }),
  segnale_autenticita: z.object({ sembra_generata_o_montata: z.boolean(), confidenza }),
  esito_suggerito: esitoSuggerito,
  spiegazione: testoBreve(2000),
});
