// Store Vercel Blob con autenticazione OIDC (variabili BLOB_STORE_ID e BLOB_WEBHOOK_PUBLIC_KEY,
// senza BLOB_READ_WRITE_TOKEN): il caricamento diretto usa URL pre-firmati.
import './setup-env.js';
process.env.VERCEL = '1';
delete process.env.TRUST_PROXY;
delete process.env.STORAGE_DRIVER;
delete process.env.BLOB_READ_WRITE_TOKEN;
process.env.BLOB_STORE_ID = 'store_ABC123def456';
process.env.BLOB_WEBHOOK_PUBLIC_KEY = 'chiave-pubblica-di-prova';
// @vercel/oidc controlla la scadenza del JWT: ne serve uno ben formato.
const parte = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const OIDC = `${parte({ alg: 'none' })}.${parte({ exp: Math.floor(Date.now() / 1000) + 3600 })}.firma`;
process.env.VERCEL_OIDC_TOKEN = OIDC;
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.GEOCODING_ENABLED = 'false';

import http from 'node:http';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

const richieste = [];
const apiFinta = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => (corpo += c));
  req.on('end', () => {
    const dati = JSON.parse(corpo || '{}');
    richieste.push({ url: req.url, dati, auth: req.headers.authorization });
    const delega = Buffer.from(JSON.stringify({ storeId: 'store_ABC123def456', ...dati })).toString('base64url');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ clientSigningToken: 'firma-di-prova', delegationToken: `${delega}.firma` }));
  });
});
await new Promise((r) => apiFinta.listen(0, '127.0.0.1', r));
process.env.VERCEL_BLOB_API_URL = `http://127.0.0.1:${apiFinta.address().port}`;

const { accedi, anonimo, avvia, chiudi, creaUtente } = await import('./helpers.js');
const { storage } = await import('../src/storage/index.js');

let utente;
let ag;
before(async () => {
  await avvia();
  utente = await creaUtente();
  ag = await accedi(utente);
});
after(async () => {
  await new Promise((r) => apiFinta.close(r));
  await chiudi();
});

const EVENTO = (pathname) => ({ type: 'blob.generate-presigned-url', payload: { pathname, clientPayload: null, multipart: false } });

describe('Store Blob con autenticazione OIDC', () => {
  test('l’archivio blob si attiva con BLOB_STORE_ID e il frontend sa di dover usare gli URL pre-firmati', async () => {
    assert.equal(storage.tipo, 'blob');
    const res = await anonimo().get('/api/v1/config');
    assert.equal(res.body.caricamentoDiretto, true);
    assert.equal(res.body.modoCaricamento, 'presigned');
  });

  test('senza accesso → 401; cartella altrui o formato non ammesso → 400, senza chiamare Vercel', async () => {
    const prima = richieste.length;
    assert.equal((await anonimo().post('/api/v1/allegati/upload').send(EVENTO(`tmp/${utente.id_utente}/a.jpg`))).status, 401);
    for (const p of [`tmp/${utente.id_utente + 1}/a.jpg`, `tmp/${utente.id_utente}/a.html`, `tmp/${utente.id_utente}/../a.jpg`]) {
      assert.equal((await ag.post('/api/v1/allegati/upload').send(EVENTO(p))).status, 400, p);
    }
    assert.equal(richieste.length, prima);
  });

  test('rilascia un URL pre-firmato per quel solo file, con formati e dimensione limitati', async () => {
    const pathname = `tmp/${utente.id_utente}/foto.jpg`;
    const res = await ag.post('/api/v1/allegati/upload').send(EVENTO(pathname));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.type, 'blob.generate-presigned-url');
    assert.ok(res.body.presignedUrlPayload);
    const rich = richieste.at(-1);
    assert.equal(rich.url, '/signed-token');
    assert.equal(rich.auth, `Bearer ${OIDC}`);
    assert.equal(rich.dati.pathname, pathname);
    assert.deepEqual(rich.dati.operations, ['put']);
    assert.ok(rich.dati.allowedContentTypes.includes('image/jpeg'));
    assert.ok(!rich.dati.allowedContentTypes.includes('text/html'));
  });
});
