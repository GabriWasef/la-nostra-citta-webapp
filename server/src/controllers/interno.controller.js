import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { eseguiManutenzione } from '../services/manutenzione.service.js';
import { AppError } from '../utils/AppError.js';

const impronta = (testo) => crypto.createHash('sha256').update(testo).digest();

/** Chiamato dal cron di Vercel, che invia "Authorization: Bearer <CRON_SECRET>". */
export async function manutenzione(req, res) {
  // Senza CRON_SECRET l'endpoint non esiste: nessuna chiave predefinita.
  if (!env.CRON_SECRET) throw new AppError(404, 'ENDPOINT_NON_TROVATO', 'Endpoint non trovato.');
  const atteso = impronta(`Bearer ${env.CRON_SECRET}`);
  const ricevuto = impronta(req.get('authorization') ?? '');
  if (!crypto.timingSafeEqual(atteso, ricevuto)) {
    throw new AppError(401, 'NON_AUTORIZZATO', 'Chiave di manutenzione non valida.');
  }
  res.json(await eseguiManutenzione());
}
