import './setup-env.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBlobStorage } from '../src/storage/blobStorage.js';
import { creaBlobFinto } from './blob-finto.js';

let finto;
before(async () => {
  finto = await creaBlobFinto();
});
after(() => finto.chiudi());

const CHIAVE = '2026/10/123e4567-e89b-12d3-a456-426614174000.jpg';

describe('Archivio su Vercel Blob (SDK simulato)', () => {
  test('scrittura sempre privata, senza sovrascritture né suffissi, con il tipo MIME', async () => {
    const archivio = createBlobStorage({ sdk: finto.sdk });
    await archivio.saveBuffer(CHIAVE, Buffer.from('immagine'), { tipoMime: 'image/jpeg' });
    const { opzioni } = finto.chiamate.put.at(-1);
    assert.equal(opzioni.access, 'private');
    assert.equal(opzioni.addRandomSuffix, false);
    assert.equal(opzioni.allowOverwrite, false);
    assert.equal(opzioni.contentType, 'image/jpeg');
    assert.deepEqual(await archivio.leggi(CHIAVE), Buffer.from('immagine'));
  });

  test('saveFile: invia il file (a pezzi se grande) e lo elimina dal disco', async () => {
    const archivio = createBlobStorage({ sdk: finto.sdk });
    const sorgente = path.join(os.tmpdir(), `prova-${Date.now()}.mp4`);
    await fs.writeFile(sorgente, Buffer.alloc(1024, 7));
    const chiave = '2026/10/223e4567-e89b-12d3-a456-426614174000.mp4';
    await archivio.saveFile(chiave, sorgente, { tipoMime: 'video/mp4' });
    assert.equal(finto.chiamate.put.at(-1).opzioni.multipart, false);
    assert.equal((await archivio.leggi(chiave)).length, 1024);
    await assert.rejects(fs.access(sorgente));
  });

  test('chiavi non generate dal server rifiutate', async () => {
    const archivio = createBlobStorage({ sdk: finto.sdk });
    for (const chiave of ['../segreto.jpg', 'tmp/1/a.jpg', '2026/10/non-uuid.jpg', '2026/10/123e4567-e89b-12d3-a456-426614174000.exe']) {
      await assert.rejects(archivio.saveBuffer(chiave, Buffer.from('x')), /non valida/, chiave);
      await assert.rejects(archivio.urlFirmato(chiave), /non valida/, chiave);
    }
  });

  test('link firmato: sola lettura, scadenza breve, token riusato e rinnovato quando scade', async () => {
    let adesso = 1_000_000_000_000;
    const archivio = createBlobStorage({ sdk: finto.sdk, durataLinkMs: 15 * 60 * 1000, ora: () => adesso });
    const prima = finto.chiamate.issueSignedToken.length;
    const url1 = await archivio.urlFirmato(CHIAVE);
    const url2 = await archivio.urlFirmato(CHIAVE);
    assert.equal(finto.chiamate.issueSignedToken.length, prima + 1, 'il token si emette una volta sola');
    const emissione = finto.chiamate.issueSignedToken.at(-1);
    assert.deepEqual(emissione.operations, ['get']);
    const richiesta = finto.chiamate.presignUrl.at(-1).opzioni;
    assert.equal(richiesta.operation, 'get');
    assert.equal(richiesta.access, 'private');
    assert.equal(richiesta.validUntil, adesso + 15 * 60 * 1000);
    assert.equal(url1, url2);

    adesso += 56 * 60 * 1000; // il token (55 minuti) sta per scadere
    await archivio.urlFirmato(CHIAVE);
    assert.equal(finto.chiamate.issueSignedToken.length, prima + 2);
  });

  test('send: reindirizza al link firmato senza memorizzarlo', async () => {
    const archivio = createBlobStorage({ sdk: finto.sdk });
    const intestazioni = {};
    let reindirizzato;
    const res = { set: (k, v) => (intestazioni[k] = v), redirect: (stato, url) => (reindirizzato = { stato, url }) };
    await archivio.send(res, CHIAVE);
    assert.equal(reindirizzato.stato, 302);
    assert.match(reindirizzato.url, /^http:\/\/127\.0\.0\.1:\d+\/file\//);
    assert.equal(intestazioni['Cache-Control'], 'private, no-store');
  });

  test('file temporanei: scaricamento, limite di dimensione, assenza', async () => {
    const archivio = createBlobStorage({ sdk: finto.sdk });
    finto.archivio.set('tmp/9/a.jpg', { buffer: Buffer.alloc(500, 1), contentType: 'image/jpeg', uploadedAt: new Date() });
    const dest = path.join(os.tmpdir(), `scarico-${Date.now()}`);
    const ok = await archivio.scaricaTemporaneo('tmp/9/a.jpg', dest, { maxByte: 1000 });
    assert.deepEqual(ok, { dimensione: 500, troppoGrande: false });
    assert.equal((await fs.readFile(dest)).length, 500);
    await fs.rm(dest);
    const grande = await archivio.scaricaTemporaneo('tmp/9/a.jpg', dest, { maxByte: 100 });
    assert.equal(grande.troppoGrande, true);
    await assert.rejects(fs.access(dest), 'nulla scritto su disco se il file è troppo grande');
    assert.equal(await archivio.scaricaTemporaneo('tmp/9/non-esiste.jpg', dest, { maxByte: 1000 }), null);
  });

  test('pulizia: elenca solo i temporanei più vecchi del limite', async () => {
    const adesso = Date.now();
    finto.archivio.set('tmp/8/vecchio.jpg', { buffer: Buffer.from('x'), uploadedAt: new Date(adesso - 30 * 3600 * 1000) });
    finto.archivio.set('tmp/8/recente.jpg', { buffer: Buffer.from('x'), uploadedAt: new Date(adesso - 3600 * 1000) });
    finto.archivio.set('2026/10/definitivo.jpg', { buffer: Buffer.from('x'), uploadedAt: new Date(adesso - 90 * 24 * 3600 * 1000) });
    const archivio = createBlobStorage({ sdk: finto.sdk });
    const vecchi = await archivio.elencaTemporaneiVecchi(24 * 3600 * 1000);
    assert.ok(vecchi.includes('tmp/8/vecchio.jpg'));
    assert.ok(!vecchi.includes('tmp/8/recente.jpg'));
    assert.ok(!vecchi.includes('2026/10/definitivo.jpg'), 'i file definitivi non si toccano mai');
  });
});
