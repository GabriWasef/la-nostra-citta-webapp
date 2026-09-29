import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

// Estensioni ammesse (RF06) e MIME dichiarati accettati in prima battuta.
// Il tipo reale viene poi verificato sul contenuto del file (media.service.js).
export const ESTENSIONI_AMMESSE = {
  '.jpg': 'IMMAGINE',
  '.jpeg': 'IMMAGINE',
  '.png': 'IMMAGINE',
  '.webp': 'IMMAGINE',
  '.mp4': 'VIDEO',
  '.mov': 'VIDEO',
  '.webm': 'VIDEO',
};

const MIME_DICHIARATI = new Set([
  'image/jpeg', 'image/png', 'image/webp',
  'video/mp4', 'video/quicktime', 'video/webm',
  'application/octet-stream',
]);

const TEMP_DIR = path.join(os.tmpdir(), 'lnc-upload');
fs.mkdirSync(TEMP_DIR, { recursive: true });

const MB = 1024 * 1024;

const uploader = multer({
  storage: multer.diskStorage({
    destination: TEMP_DIR,
    // Nome casuale: il nome originale non tocca mai il filesystem.
    filename: (req, file, cb) => cb(null, crypto.randomUUID()),
  }),
  limits: {
    fileSize: Math.max(env.MAX_IMAGE_MB, env.MAX_VIDEO_MB) * MB,
    files: env.MAX_FILES,
    fields: 30,
    fieldSize: 64 * 1024,
    parts: env.MAX_FILES + 30,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ESTENSIONI_AMMESSE[ext] || !MIME_DICHIARATI.has(file.mimetype)) {
      return cb(
        new AppError(
          400,
          'FILE_NON_AMMESSO',
          `Il file "${file.originalname}" non è ammesso. Formati accettati: JPG, PNG, WEBP, MP4, MOV, WEBM.`,
        ),
      );
    }
    cb(null, true);
  },
});

/** Accetta fino a MAX_FILES file nel campo "allegati". */
export const uploadAllegati = uploader.array('allegati', env.MAX_FILES);

export function limiteByteMedia(tipoMedia) {
  return (tipoMedia === 'VIDEO' ? env.MAX_VIDEO_MB : env.MAX_IMAGE_MB) * MB;
}

/** Elimina i file temporanei di multer (chiamato sempre a fine richiesta). */
export async function pulisciTemporanei(req) {
  const files = Array.isArray(req.files) ? req.files : [];
  await Promise.all(files.map((f) => fs.promises.rm(f.path, { force: true })));
}
