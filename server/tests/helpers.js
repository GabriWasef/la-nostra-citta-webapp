import './setup-env.js';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import request from 'supertest';
import { migra } from '../scripts/migrate.js';
import { seedBase } from '../scripts/seed.js';
import { createApp } from '../src/app.js';
import { closePool, pool } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import * as utenti from '../src/repositories/utente.repository.js';
import { hashPassword } from '../src/services/auth.service.js';

export { pool, env };
export const PASSWORD = 'PasswordSicura1';

let app;
let hashComune;

/** Database di test pulito, con dati di riferimento, e app Express. */
export async function avvia() {
  await migra({ fresh: true, log: () => {} });
  await seedBase(() => {});
  app = createApp();
  return app;
}

export async function chiudi() {
  app?.locals.close();
  await closePool();
  await fs.rm(env.uploadDir, { recursive: true, force: true });
}

let contatore = 0;
export async function creaUtente(ruolo = 'CITTADINO', dati = {}) {
  hashComune ??= await hashPassword(PASSWORD);
  contatore++;
  const email = dati.email ?? `utente${contatore}-${Date.now()}@test.it`;
  const id = await utenti.create({ nome: 'Mario', cognome: `Test${contatore}`, email, passwordHash: hashComune, ruolo, ...dati });
  return utenti.findById(id);
}

/** Agente supertest con sessione aperta. */
export async function accedi(utente) {
  const agente = request.agent(app);
  const res = await agente.post('/api/v1/auth/login').send({ email: utente.email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`Login fallito: ${res.status} ${JSON.stringify(res.body)}`);
  return agente;
}

export const anonimo = () => request(app);

export async function jpeg({ gps = null, larghezza = 640, altezza = 480 } = {}) {
  let img = sharp({ create: { width: larghezza, height: altezza, channels: 3, background: '#7a8a60' } }).jpeg();
  if (gps) {
    const dms = (v) => {
      const a = Math.abs(v);
      const g = Math.floor(a);
      const m = Math.floor((a - g) * 60);
      const s = Math.round(((a - g) * 60 - m) * 60 * 100);
      return `${g}/1 ${m}/1 ${s}/100`;
    };
    img = img.withExif({
      IFD3: {
        GPSLatitudeRef: gps[0] >= 0 ? 'N' : 'S',
        GPSLatitude: dms(gps[0]),
        GPSLongitudeRef: gps[1] >= 0 ? 'E' : 'W',
        GPSLongitude: dms(gps[1]),
      },
    });
  }
  return img.toBuffer();
}

export const DATI_SEGNALAZIONE = {
  titolo: 'Buca profonda in via Padova',
  descrizione: 'Buca profonda circa quindici centimetri davanti al civico 120, pericolosa per bici e pedoni.',
  id_quartiere: 1,
};

/** Crea una segnalazione via API (multipart). files: [{ buffer, nome }] */
export async function inviaSegnalazione(agente, dati = {}, files = null) {
  const req = agente.post('/api/v1/segnalazioni');
  for (const [k, v] of Object.entries({ ...DATI_SEGNALAZIONE, ...dati })) {
    for (const valore of Array.isArray(v) ? v : [v]) req.field(k, String(valore));
  }
  for (const f of files ?? [{ buffer: await jpeg(), nome: 'foto.jpg' }]) {
    req.attach('allegati', f.buffer, f.nome);
  }
  return req;
}

/** Porta una segnalazione in uno stato tramite l'API di moderazione. */
export function cambiaStato(agenteModeratore, id, codice, motivazione = 'Verificata') {
  return agenteModeratore.patch(`/api/v1/moderazione/segnalazioni/${id}/stato`).send({ codice, motivazione });
}

export async function fileSalvati() {
  const elenco = await fs.readdir(env.uploadDir, { recursive: true, withFileTypes: true });
  return elenco.filter((d) => d.isFile()).length;
}
