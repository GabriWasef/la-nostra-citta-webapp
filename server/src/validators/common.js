import { z } from 'zod';

// Messaggi di errore di Zod in italiano; i campi assenti hanno un messaggio più semplice.
z.config(z.locales.it());
z.config({
  customError: (issue) => (issue.code === 'invalid_type' && issue.input === undefined ? 'Campo obbligatorio.' : undefined),
});

export const id = z.coerce.number().int().positive();

export const paramsId = z.object({ id });

export const paginazione = {
  pagina: z.coerce.number().int().min(1).default(1),
  perPagina: z.coerce.number().int().min(1).max(50).default(12),
};

/** Stringa ripulita dagli spazi; vuota → undefined (campo facoltativo). */
export const testoOpzionale = (max) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : typeof v === 'string' ? v.trim() : v),
    z.string().max(max).optional(),
  );

/** Intero facoltativo: '' o null → null. */
export const idOpzionale = z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().positive().nullable());

export const password = z
  .string()
  .min(10, 'La password deve avere almeno 10 caratteri.')
  .max(128, 'La password può avere al massimo 128 caratteri.')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'La password deve contenere almeno una lettera e un numero.');

export const nomePersona = (etichetta) =>
  z
    .string()
    .trim()
    .min(2, `${etichetta} deve avere almeno 2 caratteri.`)
    .max(80, `${etichetta} può avere al massimo 80 caratteri.`);

export const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Indirizzo e-mail non valido.'));
