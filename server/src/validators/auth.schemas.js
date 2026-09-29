import { z } from 'zod';
import { email, idOpzionale, nomePersona, password } from './common.js';

export const registrazione = z.object({
  nome: nomePersona('Il nome'),
  cognome: nomePersona('Il cognome'),
  email,
  password,
  id_quartiere_residenza: idOpzionale.optional().default(null),
  consenso_privacy: z.literal(true, { error: 'Devi accettare l’informativa sulla privacy.' }),
});

export const login = z.object({
  email,
  password: z.string().min(1, 'Inserisci la password.').max(128),
});

export const richiestaRecupero = z.object({ email });

export const reimpostaPassword = z.object({
  token: z.string().min(20).max(200),
  password,
});
