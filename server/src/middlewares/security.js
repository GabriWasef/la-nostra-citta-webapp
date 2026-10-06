import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { MySqlRateLimitStore } from '../config/rateLimitStore.js';
import { AppError } from '../utils/AppError.js';

const METODI_SICURI = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protezione CSRF complementare ai cookie SameSite=Lax: le richieste che
 * modificano dati devono provenire dall'origine della webapp o da una
 * origine autorizzata. Le richieste senza Origin/Referer (client non browser)
 * non trasportano cookie di terze parti e sono ammesse.
 */
export function originCheck(req, res, next) {
  if (METODI_SICURI.has(req.method)) return next();
  const consentite = [env.APP_ORIGIN, ...env.corsOrigins];
  let origine = req.get('origin');
  if (!origine && req.get('referer')) {
    try {
      origine = new URL(req.get('referer')).origin;
    } catch {
      origine = 'invalida';
    }
  }
  // Stessa origine della richiesta (es. http://127.0.0.1:3000 o l'IP del PC in rete locale):
  // un sito esterno non può presentarsi con l'origine del server che sta chiamando.
  const stessaOrigine = `${req.protocol}://${req.get('host')}`;
  if (origine && origine !== stessaOrigine && !consentite.includes(origine)) {
    return next(new AppError(403, 'ORIGINE_NON_CONSENTITA', 'Richiesta proveniente da un’origine non autorizzata.'));
  }
  next();
}

/**
 * @param persistente true per i limiti che proteggono operazioni sensibili (accesso, upload,
 *   ricerche): con RATE_LIMIT_STORE=mysql il conteggio è condiviso tra le istanze. Il limite
 *   generale dell'API resta in memoria, per non aggiungere query a ogni richiesta.
 */
function limitatore({ nome, windowMs, limit, message, keyByUser = false, persistente = false }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => !env.RATE_LIMIT_ENABLED,
    keyGenerator: keyByUser ? (req) => (req.user ? `u${req.user.id_utente}` : ipKeyGenerator(req.ip)) : undefined,
    store: persistente && env.rateLimitStore === 'mysql' ? new MySqlRateLimitStore(pool, nome) : undefined,
    // Se il database non risponde, la richiesta non viene bloccata dal limitatore.
    passOnStoreError: true,
    handler: (req, res, next) => next(new AppError(429, 'TROPPE_RICHIESTE', message)),
  });
}

export const limiteApi = limitatore({
  nome: 'api',
  windowMs: 60 * 1000,
  limit: 300,
  message: 'Troppe richieste. Riprova tra un minuto.',
});

export const limiteAuth = limitatore({
  nome: 'auth',
  persistente: true,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: 'Troppi tentativi. Riprova tra qualche minuto.',
});

export const limiteUpload = limitatore({
  nome: 'segnalazioni',
  persistente: true,
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: 'Hai inviato troppe segnalazioni nell’ultima ora. Riprova più tardi.',
  keyByUser: true,
});

export const limiteGeocodifica = limitatore({
  nome: 'geocodifica',
  persistente: true,
  windowMs: 60 * 1000,
  limit: 30,
  message: 'Troppe ricerche di indirizzi. Attendi un minuto.',
  keyByUser: true,
});

/** Autorizzazioni di caricamento diretto degli allegati (una per file). */
export const limiteTokenAllegati = limitatore({
  nome: 'token-allegati',
  persistente: true,
  windowMs: 60 * 60 * 1000,
  limit: 60,
  message: 'Troppi caricamenti di file nell’ultima ora. Riprova più tardi.',
  keyByUser: true,
});
