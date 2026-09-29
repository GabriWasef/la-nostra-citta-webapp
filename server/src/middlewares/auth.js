import * as utenteRepository from '../repositories/utente.repository.js';
import { nonAutenticato, vietato } from '../utils/AppError.js';

export const RUOLI = Object.freeze({
  CITTADINO: 'CITTADINO',
  MODERATORE: 'MODERATORE',
  AMMINISTRATORE: 'AMMINISTRATORE',
});

export const isModeratore = (utente) =>
  utente?.ruolo === RUOLI.MODERATORE || utente?.ruolo === RUOLI.AMMINISTRATORE;

/**
 * Popola req.user a partire dalla sessione. Ruolo e stato dell'account
 * vengono riletti dal database a ogni richiesta, così una sospensione o
 * un cambio di ruolo hanno effetto immediato.
 * Un futuro client mobile potrà autenticarsi con un token Bearer
 * aggiungendo un ramo qui, senza modificare controller e service.
 */
export async function caricaUtente(req, res, next) {
  req.user = null;
  const idUtente = req.session?.userId;
  if (!idUtente) return next();

  const utente = await utenteRepository.findById(idUtente);
  if (!utente || utente.stato_account !== 'ATTIVO') {
    await new Promise((resolve) => req.session.destroy(() => resolve()));
    return next();
  }
  req.user = utente;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return next(nonAutenticato());
  next();
}

export function requireRole(...ruoli) {
  return (req, res, next) => {
    if (!req.user) return next(nonAutenticato());
    if (!ruoli.includes(req.user.ruolo)) return next(vietato());
    next();
  };
}
