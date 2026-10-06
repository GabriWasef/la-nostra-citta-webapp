import { z } from 'zod';
import { id, paginazione, testoOpzionale } from './common.js';

/** Nei form multipart i valori multipli arrivano come stringa singola o array. */
const listaId = z.preprocess(
  (v) => (v === undefined || v === '' ? [] : Array.isArray(v) ? v : String(v).split(',')),
  z.array(id).max(5, 'Puoi scegliere al massimo 5 categorie.'),
);

const coordinata = (min, max) =>
  z.preprocess((v) => (v === '' || v === undefined || v === null ? null : v), z.coerce.number().min(min).max(max).nullable());

const booleanoForm = z.preprocess((v) => v === true || v === 'true' || v === 'on' || v === '1', z.boolean());

export const nuovaSegnalazione = z
  .object({
    titolo: z
      .string()
      .trim()
      .min(5, 'Il titolo deve avere almeno 5 caratteri.')
      .max(150, 'Il titolo può avere al massimo 150 caratteri.'),
    descrizione: z
      .string()
      .trim()
      .min(20, 'La descrizione deve avere almeno 20 caratteri.')
      .max(5000, 'La descrizione può avere al massimo 5000 caratteri.'),
    id_quartiere: z.coerce.number({ error: 'Scegli il quartiere interessato.' }).int().positive('Scegli il quartiere interessato.'),
    categorie: listaId.default([]),
    visibilita: z.enum(['PUBBLICA', 'ANONIMA', 'PRIVATA']).default('PUBBLICA'),
    indirizzo: testoOpzionale(255),
    latitudine: coordinata(-90, 90).default(null),
    longitudine: coordinata(-180, 180).default(null),
    origine_coordinate: z.enum(['UTENTE', 'MAPPA', 'GEOCODIFICA']).default('MAPPA'),
    usa_posizione_foto: booleanoForm.default(false),
    // File già caricati dal browser sull'archivio (Vercel): solo percorso e nome originale.
    allegati_blob: z
      .array(z.object({ pathname: z.string().min(5).max(300), nome: z.string().trim().min(1).max(200) }))
      .max(10)
      .default([]),
  })
  .refine((d) => (d.latitudine === null) === (d.longitudine === null), {
    message: 'Latitudine e longitudine vanno indicate insieme.',
    path: ['longitudine'],
  });

export const filtriSegnalazioni = z.object({
  quartiere: id.optional(),
  categoria: id.optional(),
  stato: z.string().regex(/^[A-Z_]+$/).optional(),
  q: testoOpzionale(100),
  ordina: z.enum(['recenti', 'meno_recenti', 'sostegni']).default('recenti'),
  ...paginazione,
});

export const filtriClassifica = z.object({
  quartiere: id.optional(),
  categoria: id.optional(),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  pagina: z.coerce.number().int().min(1).default(1),
});

export const filtriModerazione = z.object({
  stato: z.string().regex(/^[A-Z_]+$/).optional(),
  quartiere: id.optional(),
  q: testoOpzionale(100),
  ordina: z.enum(['recenti', 'meno_recenti', 'sostegni']).default('meno_recenti'),
  ...paginazione,
  perPagina: z.coerce.number().int().min(1).max(50).default(20),
});

export const cambioStato = z
  .object({
    codice: z.string().regex(/^[A-Z_]+$/),
    motivazione: testoOpzionale(1000),
  })
  .refine((d) => d.codice !== 'RIFIUTATA' || d.motivazione, {
    message: 'Indica la motivazione del rifiuto.',
    path: ['motivazione'],
  });

export const categorieSegnalazione = z.object({
  categorie: z.array(id).min(1, 'Scegli almeno una categoria.').max(5, 'Puoi scegliere al massimo 5 categorie.'),
});

export const revisioneAnalisi = z.object({
  esito_revisione: z.enum(['CONFERMATA', 'CORRETTA', 'RESPINTA']),
});
