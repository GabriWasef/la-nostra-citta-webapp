import multer from 'multer';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { pulisciTemporanei } from './upload.js';
import { zodDetails } from './validate.js';

const ERRORI_MULTER = {
  LIMIT_FILE_SIZE: [413, 'FILE_TROPPO_GRANDE', `Un file supera la dimensione massima consentita (immagini ${env.MAX_IMAGE_MB} MB, video ${env.MAX_VIDEO_MB} MB).`],
  LIMIT_FILE_COUNT: [400, 'TROPPI_FILE', `Puoi allegare al massimo ${env.MAX_FILES} file.`],
  LIMIT_UNEXPECTED_FILE: [400, 'CAMPO_FILE_NON_VALIDO', 'I file devono essere inviati nel campo "allegati".'],
};

/** Traduce gli errori di MySQL in errori applicativi comprensibili. */
function daErroreMysql(err) {
  switch (err.errno) {
    case 1062:
      return new AppError(409, 'DUPLICATO', 'Esiste già un elemento con questi dati.');
    case 1644: // SIGNAL SQLSTATE '45000' dai trigger: il messaggio è già pensato per l'utente
      return new AppError(422, 'REGOLA_VIOLATA', err.sqlMessage);
    case 3819:
      return new AppError(422, 'VINCOLO_VIOLATO', 'I dati non rispettano i vincoli previsti.');
    case 1451:
      return new AppError(409, 'IN_USO', 'L’elemento è in uso e non può essere eliminato.');
    case 1452:
      return new AppError(422, 'RIFERIMENTO_NON_VALIDO', 'Uno degli elementi indicati non esiste.');
    default:
      return null;
  }
}

export function notFoundApi(req, res, next) {
  next(new AppError(404, 'ENDPOINT_NON_TROVATO', 'Endpoint non trovato.'));
}

// eslint-disable-next-line no-unused-vars
export async function errorHandler(err, req, res, next) {
  await pulisciTemporanei(req).catch(() => {});

  let errore = err;
  if (err instanceof ZodError) {
    errore = new AppError(400, 'VALIDAZIONE_FALLITA', 'Alcuni dati non sono validi.', zodDetails(err));
  } else if (err instanceof multer.MulterError) {
    const [status, code, message] = ERRORI_MULTER[err.code] ?? [400, 'UPLOAD_NON_VALIDO', 'Caricamento non valido.'];
    errore = new AppError(status, code, message);
  } else if (err.type === 'entity.parse.failed') {
    errore = new AppError(400, 'JSON_NON_VALIDO', 'Il corpo della richiesta non è un JSON valido.');
  } else if (err.type === 'entity.too.large') {
    errore = new AppError(413, 'RICHIESTA_TROPPO_GRANDE', 'La richiesta è troppo grande.');
  } else if (err.sqlState) {
    errore = daErroreMysql(err) ?? err;
  }

  if (!(errore instanceof AppError)) {
    logger.error({ err, url: req.originalUrl, method: req.method }, 'Errore non gestito');
    errore = new AppError(500, 'ERRORE_INTERNO', 'Si è verificato un errore imprevisto. Riprova più tardi.');
  }

  res.status(errore.status).json({
    error: {
      code: errore.code,
      message: errore.message,
      ...(errore.details?.length ? { details: errore.details } : {}),
    },
  });
}
