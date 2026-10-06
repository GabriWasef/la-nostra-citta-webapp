import { Router } from 'express';
import { autorizzaCaricamento } from '../controllers/allegati.controller.js';
import * as c from '../controllers/segnalazione.controller.js';
import { requireAuth } from '../middlewares/auth.js';
import { limiteTokenAllegati, limiteUpload } from '../middlewares/security.js';
import { uploadAllegati } from '../middlewares/upload.js';
import { validate } from '../middlewares/validate.js';
import { paramsId } from '../validators/common.js';
import * as s from '../validators/segnalazione.schemas.js';

export const segnalazioniRouter = Router();

segnalazioniRouter.get('/segnalazioni', validate({ query: s.filtriSegnalazioni }), c.elenco);
segnalazioniRouter.get('/segnalazioni/mie', requireAuth, validate({ query: s.filtriSegnalazioni }), c.mie);
segnalazioniRouter.get('/segnalazioni/mappa', validate({ query: s.filtriSegnalazioni }), c.mappa);
segnalazioniRouter.get('/segnalazioni/:id', validate({ params: paramsId }), c.dettaglio);
segnalazioniRouter.get('/segnalazioni/:id/storico', validate({ params: paramsId }), c.storico);
segnalazioniRouter.post(
  '/segnalazioni',
  requireAuth,
  limiteUpload,
  uploadAllegati,
  validate({ body: s.nuovaSegnalazione }),
  c.crea,
);
segnalazioniRouter.post('/segnalazioni/:id/sostegno', requireAuth, validate({ params: paramsId }), c.sostieni);
segnalazioniRouter.delete('/segnalazioni/:id/sostegno', requireAuth, validate({ params: paramsId }), c.revocaSostegno);

segnalazioniRouter.get('/classifica', validate({ query: s.filtriClassifica }), c.classifica);
segnalazioniRouter.get('/allegati/:id', validate({ params: paramsId }), c.allegato);

// Caricamento diretto dal browser sull'archivio (Vercel Blob). L'accesso è verificato
// dentro l'handler: la stessa rotta riceve anche le notifiche firmate dall'archivio.
segnalazioniRouter.post('/allegati/upload', limiteTokenAllegati, autorizzaCaricamento);
