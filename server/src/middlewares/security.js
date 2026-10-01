import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';
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

function limitatore({ windowMs, limit, message, keyByUser = false }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => !env.RATE_LIMIT_ENABLED,
    keyGenerator: keyByUser ? (req) => (req.user ? `u${req.user.id_utente}` : ipKeyGenerator(req.ip)) : undefined,
    handler: (req, res, next) => next(new AppError(429, 'TROPPE_RICHIESTE', message)),
  });
}

export const limiteApi = limitatore({
  windowMs: 60 * 1000,
  limit: 300,
  message: 'Troppe richieste. Riprova tra un minuto.',
});

export const limiteAuth = limitatore({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: 'Troppi tentativi. Riprova tra qualche minuto.',
});

export const limiteUpload = limitatore({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: 'Hai inviato troppe segnalazioni nell’ultima ora. Riprova più tardi.',
  keyByUser: true,
});

export const limiteGeocodifica = limitatore({
  windowMs: 60 * 1000,
  limit: 30,
  message: 'Troppe ricerche di indirizzi. Attendi un minuto.',
  keyByUser: true,
});
