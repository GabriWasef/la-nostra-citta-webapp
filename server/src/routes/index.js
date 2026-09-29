import { Router } from 'express';
import { pool } from '../config/db.js';
import { adminRouter } from './admin.routes.js';
import { authRouter } from './auth.routes.js';
import { catalogoRouter } from './catalogo.routes.js';
import { moderazioneRouter } from './moderazione.routes.js';
import { segnalazioniRouter } from './segnalazioni.routes.js';
import { utentiRouter } from './utenti.routes.js';

export const apiRouter = Router();

apiRouter.get('/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ stato: 'ok', database: 'ok' });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/utenti', utentiRouter);
apiRouter.use('/moderazione', moderazioneRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use(catalogoRouter);
apiRouter.use(segnalazioniRouter);
