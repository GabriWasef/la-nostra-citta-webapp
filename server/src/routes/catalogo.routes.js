import { Router } from 'express';
import * as c from '../controllers/catalogo.controller.js';

// Dati di riferimento pubblici.
export const catalogoRouter = Router();

catalogoRouter.get('/quartieri', c.listQuartieri);
catalogoRouter.get('/categorie', c.listCategorie);
catalogoRouter.get('/stati', c.listStati);
catalogoRouter.get('/statistiche', c.statistiche);
