import { AppError } from '../utils/AppError.js';

export function zodDetails(error) {
  return error.issues.map((i) => ({ campo: i.path.join('.') || undefined, messaggio: i.message }));
}

/**
 * Valida body, query e params con schemi Zod.
 * I dati validati (e convertiti) finiscono in req.valid, perché in
 * Express 5 req.query è in sola lettura.
 */
export function validate({ body, query, params } = {}) {
  return (req, res, next) => {
    req.valid = req.valid ?? {};
    for (const [parte, schema] of Object.entries({ params, query, body })) {
      if (!schema) continue;
      const risultato = schema.safeParse(req[parte] ?? {});
      if (!risultato.success) {
        return next(
          new AppError(400, 'VALIDAZIONE_FALLITA', 'Alcuni dati non sono validi.', zodDetails(risultato.error)),
        );
      }
      req.valid[parte] = risultato.data;
    }
    next();
  };
}
