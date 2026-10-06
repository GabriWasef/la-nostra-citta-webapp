// Modalità Vercel: archivio Blob privato (simulato), caricamento diretto, limiti su MySQL,
// manutenzione periodica e diagnostica. Ogni file di test gira in un processo separato,
// quindi qui si può impostare l'ambiente prima di importare l'applicazione.
import './setup-env.js';
process.env.VERCEL = '1';
delete process.env.TRUST_PROXY; // su Vercel non si imposta: viene dedotto
process.env.STORAGE_DRIVER = 'blob';
process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_STORE123_segretodiprova';
process.env.CRON_SECRET = 'chiave-di-prova-per-il-cron';
process.env.RATE_LIMIT_ENABLED = 'true';
process.env.GEOCODING_ENABLED = 'false';

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { getPayloadFromClientToken } from '@vercel/blob/client';
import { creaBlobFinto } from './blob-finto.js';

const { accedi, anonimo, avvia, cambiaStato, chiudi, creaUtente, jpeg, pool, DATI_SEGNALAZIONE } = await import('./helpers.js');
const { storage } = await import('../src/storage/index.js');
const { createBlobStorage } = await import('../src/storage/blobStorage.js');
const { env } = await import('../src/config/env.js');

let finto;
let autore;
let altro;
let agAutore;
let agAltro;
let agMod;
let agAdmin;

before(async () => {
  finto = await creaBlobFinto();
  // L'oggetto "storage" è condiviso da tutta l'applicazione: lo si sostituisce con uno su SDK simulato.
  Object.assign(storage, createBlobStorage({ sdk: finto.sdk }));
  await avvia();
  autore = await creaUtente();
  altro = await creaUtente();
  [agAutore, agAltro, agMod, agAdmin] = await Promise.all([
    accedi(autore),
    accedi(altro),
    creaUtente('MODERATORE').then(accedi),
    creaUtente('AMMINISTRATORE').then(accedi),
  ]);
});
after(async () => {
  await finto.chiudi();
  await chiudi();
});

const EVENTO = (pathname) => ({ type: 'blob.generate-client-token', payload: { pathname, clientPayload: null, multipart: false } });

/** Simula il browser: file già sull'archivio in tmp/<id utente>/. */
async function caricaTemporaneo(utente, nome, buffer, contentType = 'image/jpeg') {
  const pathname = `tmp/${utente.id_utente}/${Math.random().toString(36).slice(2)}-${nome}`;
  finto.archivio.set(pathname, { buffer, contentType, uploadedAt: new Date() });
  return pathname;
}

const inviaJson = (agente, extra = {}) => agente.post('/api/v1/segnalazioni').send({ ...DATI_SEGNALAZIONE, categorie: [7], ...extra });

describe('Configurazione per il frontend', () => {
  test('GET /config indica il caricamento diretto e i limiti, senza segreti', async () => {
    const res = await anonimo().get('/api/v1/config');
    assert.equal(res.body.caricamentoDiretto, true);
    assert.equal(res.body.maxFiles, env.MAX_FILES);
    assert.equal(JSON.stringify(res.body).includes('segreto'), false);
  });

  test('indirizzo del sito dedotto e proxy considerato attendibile su Vercel', () => {
    assert.equal(env.trustProxy, true);
    assert.equal(env.rateLimitStore, 'mysql');
  });
});

describe('Autorizzazione al caricamento diretto', () => {
  test('senza accesso → 401', async () => {
    const res = await anonimo().post('/api/v1/allegati/upload').send(EVENTO(`tmp/${autore.id_utente}/a.jpg`));
    assert.equal(res.status, 401);
  });

  test('rilascia un token per un solo file, nella cartella dell’utente, con formati e dimensione limitati', async () => {
    const res = await agAutore.post('/api/v1/allegati/upload').send(EVENTO(`tmp/${autore.id_utente}/foto.jpg`));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.type, 'blob.generate-client-token');
    const payload = getPayloadFromClientToken(res.body.clientToken);
    assert.equal(payload.pathname, `tmp/${autore.id_utente}/foto.jpg`);
    assert.ok(payload.allowedContentTypes.includes('video/mp4'));
    assert.ok(!payload.allowedContentTypes.includes('text/html'));
    assert.equal(payload.maximumSizeInBytes, env.MAX_VIDEO_MB * 1024 * 1024);
    assert.equal(payload.addRandomSuffix, true);
    assert.ok(payload.validUntil - Date.now() < 31 * 60 * 1000, 'autorizzazione di breve durata');
  });

  test('cartella di un altro utente, uscita dal percorso o formato non ammesso → 400', async () => {
    for (const pathname of [`tmp/${altro.id_utente}/foto.jpg`, `tmp/${autore.id_utente}/../x/foto.jpg`, `2026/10/foto.jpg`, `tmp/${autore.id_utente}/script.html`, `tmp/${autore.id_utente}/doc.pdf`]) {
      const res = await agAutore.post('/api/v1/allegati/upload').send(EVENTO(pathname));
      assert.equal(res.status, 400, pathname);
    }
  });
});

describe('Creazione con allegati già caricati', () => {
  test('scarica, ricontrolla, ricodifica senza EXIF, salva privato e cancella i temporanei', async () => {
    const buffer = await jpeg({ gps: [45.47, 9.2] });
    const pathname = await caricaTemporaneo(autore, 'gps.jpg', buffer);
    const res = await inviaJson(agAutore, { usa_posizione_foto: true, allegati_blob: [{ pathname, nome: 'gps.jpg' }] });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const s = res.body.segnalazione;
    assert.equal(s.origine_coordinate, 'EXIF');
    assert.equal(s.allegati.length, 1);

    const scritto = finto.chiamate.put.at(-1);
    assert.match(scritto.pathname, /^\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
    assert.equal(scritto.opzioni.access, 'private');
    assert.equal(scritto.opzioni.contentType, 'image/jpeg');
    const exifr = (await import('exifr')).default;
    assert.equal(await exifr.gps(finto.archivio.get(scritto.pathname).buffer).catch(() => undefined), undefined, 'GPS rimosso');
    assert.equal(finto.archivio.has(pathname), false, 'file temporaneo eliminato');
  });

  test('file con estensione falsificata o percorso di un altro utente → 400 e nessun file rimasto', async () => {
    const finto1 = await caricaTemporaneo(autore, 'falso.jpg', Buffer.from('<?php echo 1; ?>'));
    const r1 = await inviaJson(agAutore, { allegati_blob: [{ pathname: finto1, nome: 'falso.jpg' }] });
    assert.equal(r1.status, 400);
    assert.equal(r1.body.error.code, 'FILE_NON_VALIDO');
    assert.equal(finto.archivio.has(finto1), false, 'temporaneo eliminato anche in caso di errore');

    const altrui = await caricaTemporaneo(altro, 'altrui.jpg', await jpeg());
    const r2 = await inviaJson(agAutore, { allegati_blob: [{ pathname: altrui, nome: 'altrui.jpg' }] });
    assert.equal(r2.status, 400);
    assert.equal(finto.archivio.has(altrui), true, 'i file degli altri utenti non si toccano');
  });

  test('file inesistente, duplicato, troppo grande o troppi file → errori chiari', async () => {
    const mancante = await inviaJson(agAutore, { allegati_blob: [{ pathname: `tmp/${autore.id_utente}/non-caricato.jpg`, nome: 'a.jpg' }] });
    assert.equal(mancante.status, 400);

    const p = await caricaTemporaneo(autore, 'dup.jpg', await jpeg());
    const doppio = await inviaJson(agAutore, { allegati_blob: [{ pathname: p, nome: 'a.jpg' }, { pathname: p, nome: 'b.jpg' }] });
    assert.equal(doppio.status, 400);

    const enorme = await caricaTemporaneo(autore, 'enorme.jpg', Buffer.alloc(env.MAX_IMAGE_MB * 1024 * 1024 + 1, 1));
    const grande = await inviaJson(agAutore, { allegati_blob: [{ pathname: enorme, nome: 'enorme.jpg' }] });
    assert.equal(grande.status, 413);

    const tanti = await Promise.all(Array.from({ length: env.MAX_FILES + 1 }, async (_, i) => ({ pathname: await caricaTemporaneo(autore, `t${i}.jpg`, await jpeg()), nome: `t${i}.jpg` })));
    const troppi = await inviaJson(agAutore, { allegati_blob: tanti });
    assert.equal(troppi.status, 400);
    assert.equal(troppi.body.error.code, 'TROPPI_FILE');
  });

  test('senza allegati né file → ancora ALLEGATO_OBBLIGATORIO', async () => {
    const res = await inviaJson(agAutore);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'ALLEGATO_OBBLIGATORIO');
  });
});

describe('Download degli allegati con link firmati', () => {
  let idSegnalazione;
  let idAllegato;

  before(async () => {
    const pathname = await caricaTemporaneo(autore, 'pubblica.jpg', await jpeg());
    const res = await inviaJson(agAutore, { visibilita: 'PRIVATA', allegati_blob: [{ pathname, nome: 'pubblica.jpg' }] });
    idSegnalazione = res.body.segnalazione.id_segnalazione;
    idAllegato = res.body.segnalazione.allegati[0].id_allegato;
  });

  test('l’autore e il comitato ricevono un reindirizzamento al link firmato; gli altri 404', async () => {
    const proprio = await agAutore.get(`/api/v1/allegati/${idAllegato}`).redirects(0);
    assert.equal(proprio.status, 302);
    assert.match(proprio.headers.location, /^http:\/\/127\.0\.0\.1:\d+\/file\/\d{4}\/\d{2}\//);
    assert.equal(proprio.headers['cache-control'], 'private, no-store');
    assert.equal((await agMod.get(`/api/v1/allegati/${idAllegato}`).redirects(0)).status, 302);
    assert.equal((await agAltro.get(`/api/v1/allegati/${idAllegato}`).redirects(0)).status, 404);
    assert.equal((await anonimo().get(`/api/v1/allegati/${idAllegato}`).redirects(0)).status, 404);
  });

  test('una volta pubblicata, il file è visibile a tutti (sempre tramite link firmato)', async () => {
    await pool.query("UPDATE segnalazione SET visibilita = 'PUBBLICA' WHERE id_segnalazione = ?", [idSegnalazione]);
    await pool.query('INSERT INTO segnalazione_categoria (id_segnalazione, id_categoria) SELECT ?, 7 WHERE NOT EXISTS (SELECT 1 FROM segnalazione_categoria WHERE id_segnalazione = ?)', [idSegnalazione, idSegnalazione]);
    await cambiaStato(agMod, idSegnalazione, 'APPROVATA').expect(200);
    const res = await anonimo().get(`/api/v1/allegati/${idAllegato}`).redirects(0);
    assert.equal(res.status, 302);
  });
});

describe('Limiti di frequenza condivisi su MySQL', () => {
  test('i tentativi di accesso vengono contati nel database e dopo 20 si viene fermati', async () => {
    // Il limite è per indirizzo IP: gli accessi già fatti nel "before" (4) contano nello stesso conteggio.
    const [[{ prima }]] = await pool.query("SELECT COALESCE(SUM(conteggio), 0) AS prima FROM limite_richieste WHERE chiave LIKE 'auth:%'");
    const stati = [];
    for (let i = 0; i < 24; i++) stati.push((await anonimo().post('/api/v1/auth/login').send({ email: 'nessuno@test.it', password: 'Sbagliata123' })).status);
    assert.equal(stati.filter((s) => s === 401).length, 20 - Number(prima), 'passano solo le richieste fino a 20 in totale');
    assert.equal(stati.filter((s) => s === 429).length, 24 - (20 - Number(prima)));
    assert.ok(stati.indexOf(429) > 0, 'prima le richieste passano, poi scatta il blocco');
    const [[riga]] = await pool.query("SELECT conteggio FROM limite_richieste WHERE chiave LIKE 'auth:%'");
    assert.ok(riga.conteggio >= 20, 'il conteggio è nella tabella limite_richieste');
  });
});

describe('Manutenzione periodica (cron)', () => {
  test('senza la chiave giusta → 401; con la chiave → pulisce e riporta i conteggi', async () => {
    assert.equal((await anonimo().get('/api/v1/interno/manutenzione')).status, 401);
    assert.equal((await anonimo().get('/api/v1/interno/manutenzione').set('Authorization', 'Bearer sbagliata')).status, 401);

    finto.archivio.set('tmp/7/abbandonato.jpg', { buffer: Buffer.from('x'), uploadedAt: new Date(Date.now() - 48 * 3600 * 1000) });
    finto.archivio.set('tmp/7/in-corso.jpg', { buffer: Buffer.from('x'), uploadedAt: new Date() });
    await pool.query("INSERT INTO limite_richieste (chiave, conteggio, scadenza) VALUES ('vecchia:x', 3, DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR))");
    await pool.query("INSERT INTO sessione (session_id, scadenza, dati) VALUES ('scaduta', DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY), '{}')");

    const res = await anonimo().get('/api/v1/interno/manutenzione').set('Authorization', `Bearer ${env.CRON_SECRET}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.file_temporanei_eliminati, 1);
    assert.ok(res.body.limiti_scaduti >= 1);
    assert.ok(res.body.sessioni_scadute >= 1);
    assert.equal(finto.archivio.has('tmp/7/abbandonato.jpg'), false);
    assert.equal(finto.archivio.has('tmp/7/in-corso.jpg'), true, 'i caricamenti recenti non si toccano');
  });
});

describe('Diagnostica (solo amministratori)', () => {
  test('accesso negato ai non amministratori', async () => {
    await agMod.get('/api/v1/admin/diagnostica').expect(403);
    await anonimo().get('/api/v1/admin/diagnostica').expect(401);
  });

  test('prova l’archivio (scrive, legge, scarica dal link firmato, elimina) e segnala cosa non va', async () => {
    const res = await agAdmin.get('/api/v1/admin/diagnostica');
    assert.equal(res.status, 200);
    const archivio = res.body.controlli.find((c) => c.nome === 'Archivio degli allegati');
    assert.equal(archivio.ok, true, `dettaglio: ${archivio.dettaglio}`);
    assert.match(archivio.dettaglio, /scrittura, lettura, link firmato, eliminazione/);
    assert.equal(res.body.controlli.find((c) => c.nome === 'Database').ok, true);
    assert.equal(res.body.controlli.find((c) => c.nome === 'Migrazioni').ok, true);
    assert.equal(res.body.controlli.find((c) => c.nome === 'Ricerca degli indirizzi').ok, false, 'geocodifica disattivata nel test');
    assert.equal(res.body.ambiente.archivio, 'blob');
    assert.ok(!JSON.stringify(res.body).includes(env.CRON_SECRET), 'nessun segreto nella risposta');
  });
});
