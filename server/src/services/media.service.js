import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import exifr from 'exifr';
import { fileTypeFromFile } from 'file-type';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { ESTENSIONI_AMMESSE, limiteByteMedia } from '../middlewares/upload.js';
import { scansionaFile, storage } from '../storage/index.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

// MIME reale (letto dai magic bytes) ammesso per ogni estensione.
const MIME_PER_ESTENSIONE = {
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
  '.mp4': ['video/mp4', 'video/x-m4v'],
  '.mov': ['video/quicktime'],
  '.webm': ['video/webm'],
};

const ESTENSIONE_SALVATA = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/x-m4v': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

const LATO_MASSIMO_IMMAGINE = 2048;

/** Nome originale ripulito: salvato solo come metadato, mai usato come percorso. */
export function nomeSicuro(nome) {
  const base = path.basename(nome).normalize('NFC');
  const pulito = base.replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/\s+/g, ' ').trim();
  return (pulito || 'file').slice(0, 200);
}

const nonValido = (nome, motivo) =>
  new AppError(400, 'FILE_NON_VALIDO', `Il file "${nomeSicuro(nome)}" non è valido: ${motivo}`);

async function coordinateExif(percorso) {
  try {
    const gps = await exifr.gps(percorso);
    if (!gps || !Number.isFinite(gps.latitude) || !Number.isFinite(gps.longitude)) return null;
    if (Math.abs(gps.latitude) > 90 || Math.abs(gps.longitude) > 180) return null;
    if (gps.latitude === 0 && gps.longitude === 0) return null;
    return { latitudine: Number(gps.latitude.toFixed(6)), longitudine: Number(gps.longitude.toFixed(6)) };
  } catch {
    return null;
  }
}

async function hashFile(percorso) {
  const h = crypto.createHash('sha256');
  for await (const blocco of createReadStream(percorso)) h.update(blocco);
  return h.digest('hex');
}

/** Ricodifica: applica l'orientamento, ridimensiona, comprime e rimuove tutti i metadati (EXIF, GPS). */
async function ricodificaImmagine(percorso, mime) {
  let pipeline = sharp(percorso, { failOn: 'error' })
    .rotate()
    .resize({ width: LATO_MASSIMO_IMMAGINE, height: LATO_MASSIMO_IMMAGINE, fit: 'inside', withoutEnlargement: true });
  if (mime === 'image/png') pipeline = pipeline.png({ compressionLevel: 9 });
  else if (mime === 'image/webp') pipeline = pipeline.webp({ quality: 80 });
  else pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true });
  return pipeline.toBuffer({ resolveWithObject: true });
}

/**
 * Valida un file caricato e lo salva nell'archivio.
 * Il file temporaneo di multer viene consumato (spostato o eliminato dal chiamante).
 * @returns metadati per la tabella allegato + chiave di archiviazione
 */
export async function elaboraFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const tipoMedia = ESTENSIONI_AMMESSE[ext];
  if (!tipoMedia) throw nonValido(file.originalname, 'formato non ammesso.');

  if (file.size > limiteByteMedia(tipoMedia)) {
    throw new AppError(413, 'FILE_TROPPO_GRANDE', `Il file "${nomeSicuro(file.originalname)}" supera la dimensione massima consentita.`);
  }
  if (file.size === 0) throw nonValido(file.originalname, 'il file è vuoto.');

  // Il tipo reale deve corrispondere all'estensione: blocca file rinominati.
  const rilevato = await fileTypeFromFile(file.path);
  if (!rilevato || !MIME_PER_ESTENSIONE[ext].includes(rilevato.mime)) {
    throw nonValido(file.originalname, 'il contenuto non corrisponde all’estensione.');
  }

  const scansione = await scansionaFile(file.path);
  if (!scansione.pulito) throw nonValido(file.originalname, 'il file non ha superato il controllo di sicurezza.');

  const mime = rilevato.mime === 'video/x-m4v' ? 'video/mp4' : rilevato.mime;
  const oggi = new Date();
  const chiave = `${oggi.getUTCFullYear()}/${String(oggi.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ESTENSIONE_SALVATA[mime]}`;

  let exif = null;
  let dimensione;
  let hash;
  let larghezza = null;
  let altezza = null;

  if (tipoMedia === 'IMMAGINE') {
    exif = await coordinateExif(file.path);
    let risultato;
    try {
      risultato = await ricodificaImmagine(file.path, mime);
    } catch (err) {
      logger.debug({ err }, 'Immagine non decodificabile');
      throw nonValido(file.originalname, 'l’immagine è danneggiata o non leggibile.');
    }
    await storage.saveBuffer(chiave, risultato.data, { tipoMime: mime });
    dimensione = risultato.data.length;
    hash = crypto.createHash('sha256').update(risultato.data).digest('hex');
    larghezza = risultato.info.width;
    altezza = risultato.info.height;
  } else {
    // I video non vengono ricodificati (servirebbe ffmpeg): si verificano tipo e dimensione.
    hash = await hashFile(file.path);
    dimensione = file.size;
    await storage.saveFile(chiave, file.path, { tipoMime: mime });
  }

  return {
    chiave,
    nome_file: nomeSicuro(file.originalname),
    tipo_mime: mime,
    tipo_media: tipoMedia,
    dimensione_bytes: dimensione,
    hash_sha256: hash,
    latitudine_exif: exif?.latitudine ?? null,
    longitudine_exif: exif?.longitudine ?? null,
    larghezza,
    altezza,
  };
}

/** Elimina i file già salvati quando la transazione fallisce (compensazione). */
export async function eliminaFile(chiavi) {
  await Promise.all(
    chiavi.map((c) => storage.remove(c).catch((err) => logger.warn({ err, chiave: c }, 'File non eliminato'))),
  );
}

/**
 * Caricamento diretto dal browser (Vercel): i file sono già nell'archivio, in tmp/<id utente>/.
 * Qui si scaricano su disco per passare dagli stessi controlli dei file inviati con il modulo.
 * Si accettano solo percorsi dell'utente stesso: il browser non può indicare indirizzi arbitrari.
 * @returns {Promise<{files: object[], temporanei: string[]}>}
 */
export async function scaricaAllegatiDiretti(allegati, utente) {
  if (!storage.scaricaTemporaneo) {
    throw new AppError(400, 'CARICAMENTO_DIRETTO_NON_DISPONIBILE', 'Il caricamento diretto dei file non è attivo su questo server.');
  }
  if (allegati.length > env.MAX_FILES) {
    throw new AppError(400, 'TROPPI_FILE', `Puoi allegare al massimo ${env.MAX_FILES} file.`);
  }
  const prefisso = storage.prefissoTemporanei(utente.id_utente);
  const files = [];
  const temporanei = [];
  try {
    for (const { pathname, nome } of allegati) {
      if (!pathname.startsWith(prefisso) || pathname.includes('..') || temporanei.includes(pathname)) {
        throw nonValido(nome, 'allegato non riconosciuto. Caricalo di nuovo.');
      }
      temporanei.push(pathname);
      const tipoMedia = ESTENSIONI_AMMESSE[path.extname(nome).toLowerCase()];
      if (!tipoMedia) throw nonValido(nome, 'formato non ammesso.');

      const destinazione = path.join(os.tmpdir(), `lnc-${crypto.randomUUID()}`);
      const scaricato = await storage.scaricaTemporaneo(pathname, destinazione, { maxByte: limiteByteMedia(tipoMedia) });
      if (!scaricato) throw nonValido(nome, 'il caricamento non è andato a buon fine. Riprova.');
      if (scaricato.troppoGrande) {
        throw new AppError(413, 'FILE_TROPPO_GRANDE', `Il file "${nomeSicuro(nome)}" supera la dimensione massima consentita.`);
      }
      files.push({ originalname: nome, path: destinazione, size: scaricato.dimensione });
    }
  } catch (err) {
    await Promise.all(files.map((f) => fs.rm(f.path, { force: true })));
    await storage.rimuoviTemporanei(temporanei).catch((e) => logger.warn({ err: e }, 'File temporanei non eliminati'));
    throw err;
  }
  return { files, temporanei };
}

export async function eliminaAllegatiTemporanei(temporanei) {
  if (!temporanei?.length) return;
  await storage.rimuoviTemporanei(temporanei).catch((err) => logger.warn({ err }, 'File temporanei non eliminati'));
}
