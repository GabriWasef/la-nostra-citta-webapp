import { z } from 'zod';
import { paginazione, testoOpzionale } from './common.js';

const descrizione = testoOpzionale(2000).nullable();
const municipio = z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().min(1).max(9).nullable());
const nonVuoto = (d) => Object.keys(d).length > 0;

const campiQuartiere = {
  nome: z.string().trim().min(2).max(100),
  descrizione,
  municipio,
};

export const quartiere = z.object({
  nome: campiQuartiere.nome,
  descrizione: descrizione.default(null),
  municipio: municipio.default(null),
});

// Nessun default negli aggiornamenti parziali: i campi non inviati restano invariati.
export const quartiereParziale = z.object(campiQuartiere).partial().refine(nonVuoto, 'Nessun dato da aggiornare.');

export const categoria = z.object({
  nome: z.string().trim().min(2).max(100),
  descrizione: descrizione.default(null),
});

export const categoriaParziale = z
  .object({ nome: z.string().trim().min(2).max(100), descrizione })
  .partial()
  .refine(nonVuoto, 'Nessun dato da aggiornare.');

export const stato = z
  .object({ nome: z.string().trim().min(2).max(80), descrizione })
  .partial()
  .refine(nonVuoto, 'Nessun dato da aggiornare.');

export const filtriLog = z.object({ ...paginazione, perPagina: z.coerce.number().int().min(1).max(100).default(50) });
