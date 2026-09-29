import { Router } from 'express';
import * as admin from '../controllers/admin.controller.js';
import * as catalogo from '../controllers/catalogo.controller.js';
import { RUOLI, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import * as sc from '../validators/catalogo.schemas.js';
import { paramsId } from '../validators/common.js';
import * as su from '../validators/utente.schemas.js';

export const adminRouter = Router();

adminRouter.use(requireRole(RUOLI.AMMINISTRATORE));

adminRouter.get('/utenti', validate({ query: su.filtriUtentiAdmin }), admin.utenti);
adminRouter.patch('/utenti/:id', validate({ params: paramsId, body: su.aggiornaUtenteAdmin }), admin.aggiornaUtente);

adminRouter.post('/quartieri', validate({ body: sc.quartiere }), catalogo.creaQuartiere);
adminRouter.patch('/quartieri/:id', validate({ params: paramsId, body: sc.quartiereParziale }), catalogo.aggiornaQuartiere);
adminRouter.delete('/quartieri/:id', validate({ params: paramsId }), catalogo.eliminaQuartiere);

adminRouter.post('/categorie', validate({ body: sc.categoria }), catalogo.creaCategoria);
adminRouter.patch('/categorie/:id', validate({ params: paramsId, body: sc.categoriaParziale }), catalogo.aggiornaCategoria);
adminRouter.delete('/categorie/:id', validate({ params: paramsId }), catalogo.eliminaCategoria);

adminRouter.patch('/stati/:id', validate({ params: paramsId, body: sc.stato }), catalogo.aggiornaStato);

adminRouter.get('/log', validate({ query: sc.filtriLog }), admin.log);
