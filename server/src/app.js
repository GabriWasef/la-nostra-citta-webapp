import path from 'node:path';
import cors from 'cors';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { env, ROOT_DIR } from './config/env.js';
import { pool } from './config/db.js';
import { direttiveCsp } from './config/csp.js';
import { MySqlSessionStore } from './config/sessionStore.js';
import { caricaUtente } from './middlewares/auth.js';
import { errorHandler, notFoundApi } from './middlewares/errorHandler.js';
import { limiteApi, originCheck } from './middlewares/security.js';
import { apiRouter } from './routes/index.js';

const CLIENT_DIR = path.join(ROOT_DIR, 'client');
const LEAFLET_DIR = path.join(ROOT_DIR, 'node_modules/leaflet/dist');

export function createApp() {
  const app = express();
  const sessionStore = new MySqlSessionStore(pool);

  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy ? 1 : false);

  app.use(
    helmet({
      // Politica definita in config/csp.js (e ripetuta in vercel.json per le pagine statiche).
      contentSecurityPolicy: {
        useDefaults: false,
        directives: direttiveCsp({ blob: env.storageDriver === 'blob', produzione: env.isProduction }),
      },
      hsts: env.isProduction,
      // Le tessere di OpenStreetMap vengono rifiutate ("403 Access blocked") se la
      // richiesta non porta il Referer: si invia solo l'origine del sito, mai il percorso.
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // CORS solo per client esterni esplicitamente autorizzati (es. una futura app).
  if (env.corsOrigins.length) {
    app.use('/api', cors({ origin: env.corsOrigins, credentials: true }));
  }

  app.use(
    session({
      name: 'lnc.sid',
      secret: env.SESSION_SECRET,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.isProduction,
        maxAge: env.SESSION_MAX_AGE_HOURS * 3600 * 1000,
      },
    }),
  );

  app.use('/api', express.json({ limit: '100kb' }), originCheck, limiteApi, caricaUtente);
  app.use('/api/v1', apiRouter);
  app.use('/api', notFoundApi);

  app.use('/vendor/leaflet', express.static(LEAFLET_DIR, { maxAge: '7d' }));
  app.use(express.static(CLIENT_DIR, { extensions: ['html'], index: 'index.html' }));
  app.use((req, res) => res.status(404).sendFile(path.join(CLIENT_DIR, '404.html')));

  app.use(errorHandler);

  app.locals.close = () => sessionStore.close();
  return app;
}
