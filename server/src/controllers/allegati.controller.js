import path from 'node:path';
import { handleUpload } from '@vercel/blob/client';
import { ESTENSIONI_AMMESSE, limiteByteMedia } from '../middlewares/upload.js';
import { storage } from '../storage/index.js';
import { AppError, nonAutenticato } from '../utils/AppError.js';

const TIPI_MIME_AMMESSI = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];
const VALIDITA_AUTORIZZAZIONE_MS = 30 * 60 * 1000;

/**
 * Autorizza il browser a caricare un file direttamente sull'archivio (Vercel Blob),
 * senza farlo passare dalla funzione (limite di 4,5 MB per richiesta).
 * L'autorizzazione vale per un solo file, in tmp/<id utente>/, e solo per i formati ammessi:
 * il file viene poi riscaricato e ricontrollato dal server quando si invia la segnalazione.
 */
export async function autorizzaCaricamento(req, res) {
  if (storage.tipo !== 'blob') {
    throw new AppError(400, 'CARICAMENTO_DIRETTO_NON_DISPONIBILE', 'Il caricamento diretto dei file non è attivo su questo server.');
  }
  const risposta = await handleUpload({
    body: req.body,
    request: req,
    onBeforeGenerateToken: async (pathname) => {
      if (!req.user) throw nonAutenticato();
      const prefisso = storage.prefissoTemporanei(req.user.id_utente);
      if (!pathname.startsWith(prefisso) || pathname.includes('..') || !ESTENSIONI_AMMESSE[path.extname(pathname).toLowerCase()]) {
        throw new AppError(400, 'FILE_NON_AMMESSO', 'Formato non ammesso. Formati accettati: JPG, PNG, WEBP, MP4, MOV, WEBM.');
      }
      return {
        allowedContentTypes: TIPI_MIME_AMMESSI,
        maximumSizeInBytes: Math.max(limiteByteMedia('VIDEO'), limiteByteMedia('IMMAGINE')),
        addRandomSuffix: true,
        allowOverwrite: false,
        validUntil: Date.now() + VALIDITA_AUTORIZZAZIONE_MS,
      };
    },
  });
  res.json(risposta);
}
