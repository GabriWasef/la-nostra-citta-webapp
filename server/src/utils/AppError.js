export class AppError extends Error {
  /**
   * @param {number} status codice HTTP
   * @param {string} code codice applicativo stabile (es. SOSTEGNO_DUPLICATO)
   * @param {string} message messaggio comprensibile per l'utente
   * @param {Array<{campo?: string, messaggio: string}>} [details]
   */
  constructor(status, code, message, details = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const nonTrovato = (cosa = 'Risorsa') => new AppError(404, 'NON_TROVATO', `${cosa} non trovata.`);
export const nonAutenticato = () =>
  new AppError(401, 'NON_AUTENTICATO', 'Devi accedere per eseguire questa operazione.');
export const vietato = (msg = 'Non hai i permessi per eseguire questa operazione.') =>
  new AppError(403, 'VIETATO', msg);
