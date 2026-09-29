import { z } from 'zod';
import { idOpzionale, nomePersona, paginazione, password, testoOpzionale } from './common.js';

export const aggiornaProfilo = z
  .object({
    nome: nomePersona('Il nome').optional(),
    cognome: nomePersona('Il cognome').optional(),
    id_quartiere_residenza: idOpzionale.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, 'Nessun dato da aggiornare.');

export const cambiaPassword = z.object({
  password_attuale: z.string().min(1, 'Inserisci la password attuale.').max(128),
  nuova_password: password,
});

export const disattivaAccount = z.object({
  password: z.string().min(1, 'Inserisci la password per confermare.').max(128),
});

export const filtriUtentiAdmin = z.object({
  q: testoOpzionale(100),
  ruolo: z.enum(['CITTADINO', 'MODERATORE', 'AMMINISTRATORE']).optional(),
  stato_account: z.enum(['ATTIVO', 'SOSPESO', 'ELIMINATO']).optional(),
  ...paginazione,
  perPagina: z.coerce.number().int().min(1).max(100).default(25),
});

export const aggiornaUtenteAdmin = z
  .object({
    ruolo: z.enum(['CITTADINO', 'MODERATORE', 'AMMINISTRATORE']).optional(),
    stato_account: z.enum(['ATTIVO', 'SOSPESO']).optional(),
  })
  .refine((d) => d.ruolo || d.stato_account, 'Indica il ruolo o lo stato dell’account.');
