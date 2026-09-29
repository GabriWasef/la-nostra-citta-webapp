import { env } from '../config/env.js';
import * as authService from '../services/auth.service.js';
import { audit } from '../utils/audit.js';
import { logger } from '../utils/logger.js';

/** Nuovo ID di sessione al login (contro la session fixation). */
function apriSessione(req, idUtente) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = idUtente;
      req.session.save((e) => (e ? reject(e) : resolve()));
    });
  });
}

export async function registra(req, res) {
  const utente = await authService.registra(req.valid.body);
  await apriSessione(req, utente.id_utente);
  req.user = utente;
  await audit(req, 'REGISTRAZIONE', 'utente', utente.id_utente);
  res.status(201).json({ utente });
}

export async function login(req, res) {
  const { email, password } = req.valid.body;
  try {
    const utente = await authService.autentica(email, password);
    await apriSessione(req, utente.id_utente);
    req.user = utente;
    await audit(req, 'LOGIN', 'utente', utente.id_utente);
    res.json({ utente });
  } catch (err) {
    await audit(req, 'LOGIN_FALLITO', 'utente', null, { email, motivo: err.code });
    throw err;
  }
}

export async function logout(req, res) {
  await audit(req, 'LOGOUT', 'utente', req.user?.id_utente);
  await new Promise((resolve) => req.session.destroy(() => resolve()));
  res.clearCookie('lnc.sid');
  res.status(204).end();
}

export function me(req, res) {
  res.json({ utente: req.user });
}

export async function richiediRecupero(req, res) {
  const esito = await authService.richiediRecupero(req.valid.body.email);
  if (esito) {
    const link = `${env.APP_ORIGIN}/recupero-password?token=${esito.token}`;
    // L'invio dell'e-mail (es. con nodemailer e un server SMTP) non è ancora configurato:
    // in sviluppo il link viene scritto nel log del server.
    if (!env.isProduction) logger.info({ link }, 'Link di recupero password');
    await audit(req, 'RECUPERO_PASSWORD_RICHIESTO', 'utente', esito.idUtente, null, esito.idUtente);
    if (env.isTest) res.set('X-Test-Token', esito.token);
  }
  res.status(202).json({
    messaggio: 'Se l’indirizzo è registrato, riceverai un’e-mail con le istruzioni per reimpostare la password.',
  });
}

export async function reimpostaPassword(req, res) {
  const idUtente = await authService.reimpostaPassword(req.valid.body.token, req.valid.body.password);
  await audit(req, 'PASSWORD_REIMPOSTATA', 'utente', idUtente, null, idUtente);
  res.json({ messaggio: 'Password aggiornata. Ora puoi accedere con la nuova password.' });
}
