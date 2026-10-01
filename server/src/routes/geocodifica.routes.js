import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { limiteGeocodifica } from '../middlewares/security.js';
import { validate } from '../middlewares/validate.js';
import * as geocodifica from '../services/geocodifica.service.js';
import * as s from '../validators/geocodifica.schemas.js';

// Riservato agli utenti autenticati: serve a compilare una segnalazione e
// protegge il servizio esterno da usi impropri.
export const geocodificaRouter = Router();

geocodificaRouter.use(requireAuth, limiteGeocodifica);

geocodificaRouter.get('/cerca', validate({ query: s.ricerca }), async (req, res) => {
  res.json({ dati: await geocodifica.cerca(req.valid.query.q) });
});

geocodificaRouter.get('/inversa', validate({ query: s.inversa }), async (req, res) => {
  res.json({ risultato: await geocodifica.inversa(req.valid.query.lat, req.valid.query.lon) });
});
