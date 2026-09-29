import crypto from 'node:crypto';
import { pool } from '../config/db.js';
import { revocaSessioniUtente } from '../config/sessionStore.js';
import * as utenteRepository from '../repositories/utente.repository.js';
import { AppError, nonTrovato, vietato } from '../utils/AppError.js';
import { hashPassword, verificaPassword } from './auth.service.js';

export async function aggiornaProfilo(idUtente, dati) {
  try {
    await utenteRepository.updateProfilo(idUtente, dati);
  } catch (err) {
    if (err.errno === 1452) throw new AppError(422, 'QUARTIERE_NON_VALIDO', 'Il quartiere indicato non esiste.');
    throw err;
  }
  return utenteRepository.findById(idUtente);
}

async function verificaPasswordAttuale(idUtente, password) {
  const hash = await utenteRepository.findPasswordHash(idUtente);
  if (!(await verificaPassword(hash, password))) {
    throw new AppError(400, 'PASSWORD_ERRATA', 'La password attuale non è corretta.', [
      { campo: 'password_attuale', messaggio: 'Password non corretta.' },
    ]);
  }
}

export async function cambiaPassword(idUtente, { password_attuale, nuova_password }, sessionIdCorrente) {
  await verificaPasswordAttuale(idUtente, password_attuale);
  await utenteRepository.updatePassword(idUtente, await hashPassword(nuova_password));
  // Le altre sessioni aperte (altri dispositivi) vengono chiuse.
  await revocaSessioniUtente(pool, idUtente, sessionIdCorrente);
}

/**
 * Disattivazione dell'account (privacy): i dati personali vengono anonimizzati.
 * Le segnalazioni restano, attribuite a "Utente Eliminato".
 */
export async function disattivaAccount(idUtente, password) {
  const hash = await utenteRepository.findPasswordHash(idUtente);
  if (!(await verificaPassword(hash, password))) {
    throw new AppError(400, 'PASSWORD_ERRATA', 'La password non è corretta.', [
      { campo: 'password', messaggio: 'Password non corretta.' },
    ]);
  }
  await utenteRepository.anonimizza(idUtente, await hashPassword(crypto.randomBytes(32).toString('hex')));
  await revocaSessioniUtente(pool, idUtente);
}

// ---- Amministrazione

export const cercaUtenti = (filtri) => utenteRepository.cerca(filtri);

export async function aggiornaUtente(idUtente, dati, amministratore) {
  if (idUtente === amministratore.id_utente) {
    throw vietato('Non puoi modificare il ruolo o lo stato del tuo stesso account.');
  }
  const utente = await utenteRepository.findById(idUtente);
  if (!utente) throw nonTrovato('Utente');
  if (utente.stato_account === 'ELIMINATO') {
    throw new AppError(422, 'ACCOUNT_ELIMINATO', 'Un account eliminato non può essere modificato.');
  }
  await utenteRepository.updateRuoloStato(idUtente, dati);
  if (dati.stato_account === 'SOSPESO') await revocaSessioniUtente(pool, idUtente);
  return { prima: utente, dopo: await utenteRepository.findById(idUtente) };
}
