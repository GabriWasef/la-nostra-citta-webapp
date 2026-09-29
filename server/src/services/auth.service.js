import crypto from 'node:crypto';
import argon2 from 'argon2';
import { pool } from '../config/db.js';
import { revocaSessioniUtente } from '../config/sessionStore.js';
import * as sicurezzaRepository from '../repositories/sicurezza.repository.js';
import * as utenteRepository from '../repositories/utente.repository.js';
import { AppError } from '../utils/AppError.js';

const OPZIONI_ARGON2 = { type: argon2.argon2id };
const DURATA_TOKEN_MS = 60 * 60 * 1000;

export const hashPassword = (password) => argon2.hash(password, OPZIONI_ARGON2);

let hashFittizio;
/** Verifica la password; se l'utente non esiste confronta con un hash fittizio per non rivelarlo dai tempi di risposta. */
export async function verificaPassword(hash, password) {
  hashFittizio ??= await hashPassword(crypto.randomBytes(16).toString('hex'));
  try {
    return await argon2.verify(hash ?? hashFittizio, password);
  } catch {
    return false;
  }
}

const sha256 = (testo) => crypto.createHash('sha256').update(testo).digest('hex');

export async function registra({ nome, cognome, email, password, id_quartiere_residenza }) {
  const passwordHash = await hashPassword(password);
  try {
    const id = await utenteRepository.create({ nome, cognome, email, passwordHash, idQuartiere: id_quartiere_residenza });
    return utenteRepository.findById(id);
  } catch (err) {
    if (err.errno === 1062) {
      throw new AppError(409, 'EMAIL_GIA_REGISTRATA', 'Esiste già un account con questo indirizzo e-mail.');
    }
    if (err.errno === 1452) {
      throw new AppError(422, 'QUARTIERE_NON_VALIDO', 'Il quartiere indicato non esiste.');
    }
    throw err;
  }
}

export async function autentica(email, password) {
  const credenziali = await utenteRepository.findCredenzialiByEmail(email);
  const valida = await verificaPassword(credenziali?.password_hash, password);
  if (!credenziali || !valida || credenziali.stato_account === 'ELIMINATO') {
    throw new AppError(401, 'CREDENZIALI_NON_VALIDE', 'E-mail o password non corretti.');
  }
  if (credenziali.stato_account === 'SOSPESO') {
    throw new AppError(403, 'ACCOUNT_SOSPESO', 'Il tuo account è sospeso. Contatta il comitato.');
  }
  await utenteRepository.registraAccesso(credenziali.id_utente);
  return utenteRepository.findById(credenziali.id_utente);
}

/**
 * Crea un token di recupero. La risposta al client è sempre la stessa,
 * che l'e-mail esista o no, per non rivelare quali indirizzi sono registrati.
 * @returns {Promise<{token: string, idUtente: number} | null>}
 */
export async function richiediRecupero(email) {
  const credenziali = await utenteRepository.findCredenzialiByEmail(email);
  if (!credenziali || credenziali.stato_account !== 'ATTIVO') return null;
  const token = crypto.randomBytes(32).toString('base64url');
  await sicurezzaRepository.creaToken(credenziali.id_utente, sha256(token), new Date(Date.now() + DURATA_TOKEN_MS));
  return { token, idUtente: credenziali.id_utente };
}

export async function reimpostaPassword(token, password) {
  const valido = await sicurezzaRepository.trovaTokenValido(sha256(token));
  if (!valido) {
    throw new AppError(400, 'TOKEN_NON_VALIDO', 'Il link di recupero non è valido o è scaduto. Richiedine uno nuovo.');
  }
  await utenteRepository.updatePassword(valido.id_utente, await hashPassword(password));
  await sicurezzaRepository.usaToken(valido.id_token);
  await revocaSessioniUtente(pool, valido.id_utente);
  return valido.id_utente;
}
