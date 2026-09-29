import { Router } from 'express';
import * as c from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.js';
import { limiteAuth } from '../middlewares/security.js';
import { validate } from '../middlewares/validate.js';
import * as s from '../validators/auth.schemas.js';

export const authRouter = Router();

authRouter.post('/register', limiteAuth, validate({ body: s.registrazione }), c.registra);
authRouter.post('/login', limiteAuth, validate({ body: s.login }), c.login);
authRouter.post('/logout', requireAuth, c.logout);
authRouter.get('/me', c.me);
authRouter.post('/password/recupero', limiteAuth, validate({ body: s.richiestaRecupero }), c.richiediRecupero);
authRouter.post('/password/reimposta', limiteAuth, validate({ body: s.reimpostaPassword }), c.reimpostaPassword);
