import { Router } from 'express';
import * as c from '../controllers/utente.controller.js';
import { requireAuth } from '../middlewares/auth.js';
import { limiteAuth } from '../middlewares/security.js';
import { validate } from '../middlewares/validate.js';
import * as s from '../validators/utente.schemas.js';

export const utentiRouter = Router();

utentiRouter.use(requireAuth);
utentiRouter.patch('/me', validate({ body: s.aggiornaProfilo }), c.aggiornaProfilo);
utentiRouter.put('/me/password', limiteAuth, validate({ body: s.cambiaPassword }), c.cambiaPassword);
utentiRouter.delete('/me', limiteAuth, validate({ body: s.disattivaAccount }), c.disattivaAccount);
