import { registraOperazione } from '../repositories/sicurezza.repository.js';
import { logger } from './logger.js';

/**
 * Registra un'operazione importante nella tabella log_operazione.
 * Un errore di scrittura del log non deve far fallire l'operazione principale.
 */
export async function audit(req, azione, entita = null, idEntita = null, dettagli = null, idUtente = req.user?.id_utente) {
  try {
    await registraOperazione({ idUtente, azione, entita, idEntita, dettagli, ip: req.ip });
  } catch (err) {
    logger.warn({ err, azione }, 'Registrazione nel log non riuscita');
  }
}
