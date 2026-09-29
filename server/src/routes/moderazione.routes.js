import { Router } from 'express';
import * as c from '../controllers/moderazione.controller.js';
import { RUOLI, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { paramsId } from '../validators/common.js';
import * as s from '../validators/segnalazione.schemas.js';

// Funzioni del comitato: moderatori e amministratori.
export const moderazioneRouter = Router();

moderazioneRouter.use(requireRole(RUOLI.MODERATORE, RUOLI.AMMINISTRATORE));
moderazioneRouter.get('/segnalazioni', validate({ query: s.filtriModerazione }), c.coda);
moderazioneRouter.patch('/segnalazioni/:id/stato', validate({ params: paramsId, body: s.cambioStato }), c.cambiaStato);
moderazioneRouter.put('/segnalazioni/:id/categorie', validate({ params: paramsId, body: s.categorieSegnalazione }), c.impostaCategorie);
moderazioneRouter.get('/segnalazioni/:id/analisi', validate({ params: paramsId }), c.analisi);
moderazioneRouter.patch('/analisi/:id', validate({ params: paramsId, body: s.revisioneAnalisi }), c.revisionaAnalisi);
moderazioneRouter.delete('/allegati/:id', validate({ params: paramsId }), c.eliminaAllegato);
