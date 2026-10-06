import { Router } from 'express';
import * as c from '../controllers/catalogo.controller.js';
import { env } from '../config/env.js';
import { storage } from '../storage/index.js';

// Dati di riferimento pubblici.
export const catalogoRouter = Router();

catalogoRouter.get('/quartieri', c.listQuartieri);
catalogoRouter.get('/categorie', c.listCategorie);
catalogoRouter.get('/stati', c.listStati);
catalogoRouter.get('/statistiche', c.statistiche);

// Impostazioni che il frontend deve conoscere (nessun segreto).
catalogoRouter.get('/config', (req, res) => {
  res.json({
    caricamentoDiretto: storage.tipo === 'blob',
    // "token": store con BLOB_READ_WRITE_TOKEN; "presigned": store con autenticazione OIDC (BLOB_STORE_ID)
    modoCaricamento: process.env.BLOB_READ_WRITE_TOKEN ? 'token' : 'presigned',
    maxFiles: env.MAX_FILES,
    maxImageMb: env.MAX_IMAGE_MB,
    maxVideoMb: env.MAX_VIDEO_MB,
  });
});
