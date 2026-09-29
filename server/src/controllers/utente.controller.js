import * as utenteService from '../services/utente.service.js';
import { audit } from '../utils/audit.js';

export async function aggiornaProfilo(req, res) {
  const utente = await utenteService.aggiornaProfilo(req.user.id_utente, req.valid.body);
  await audit(req, 'PROFILO_AGGIORNATO', 'utente', req.user.id_utente);
  res.json({ utente });
}

export async function cambiaPassword(req, res) {
  await utenteService.cambiaPassword(req.user.id_utente, req.valid.body, req.sessionID);
  await audit(req, 'PASSWORD_CAMBIATA', 'utente', req.user.id_utente);
  res.json({ messaggio: 'Password aggiornata.' });
}

export async function disattivaAccount(req, res) {
  await audit(req, 'ACCOUNT_DISATTIVATO', 'utente', req.user.id_utente);
  await utenteService.disattivaAccount(req.user.id_utente, req.valid.body.password);
  await new Promise((resolve) => req.session.destroy(() => resolve()));
  res.clearCookie('lnc.sid');
  res.status(204).end();
}
