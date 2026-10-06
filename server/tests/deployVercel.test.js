// Coerenza della configurazione di deploy (vercel.json, build statica, funzione).
import './setup-env.js';
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const { ROOT_DIR } = await import('../src/config/env.js');
const { cspComeStringa, direttiveCsp } = await import('../src/config/csp.js');
const { preparaPublic } = await import('../scripts/build-vercel.js');

const leggiJson = async (percorso) => JSON.parse(await fs.readFile(path.join(ROOT_DIR, percorso), 'utf8'));
let config;
let pkg;

before(async () => {
  config = await leggiJson('vercel.json');
  pkg = await leggiJson('package.json');
});

describe('vercel.json', () => {
  test('il comando di build e la cartella di output corrispondono allo script del progetto', () => {
    assert.equal(config.buildCommand, 'npm run build:vercel');
    assert.ok(pkg.scripts['build:vercel']);
    assert.equal(config.outputDirectory, 'public');
    assert.equal(config.cleanUrls, true);
  });

  test('le richieste /api/* vanno alla funzione e la funzione esiste', async () => {
    assert.deepEqual(config.rewrites, [{ source: '/api/:path*', destination: '/api' }]);
    assert.ok(config.functions['api/index.js']);
    const modulo = await import(path.join(ROOT_DIR, 'api/index.js'));
    assert.equal(typeof modulo.default, 'function', 'api/index.js esporta l’applicazione Express');
    assert.ok(config.functions['api/index.js'].maxDuration >= 30, 'tempo sufficiente per elaborare i video');
  });

  test('la Content-Security-Policy delle pagine statiche coincide con quella del server', () => {
    const blocco = config.headers.find((h) => h.source.includes('api'));
    const csp = blocco.headers.find((h) => h.key === 'Content-Security-Policy').value;
    assert.equal(csp, cspComeStringa(direttiveCsp({ blob: true, produzione: true })));
    assert.ok(csp.includes('https://tile.openstreetmap.org'), 'mappa');
    assert.ok(csp.includes('https://vercel.com'), 'caricamento diretto sul Blob');
    assert.ok(!/unsafe-inline|unsafe-eval/.test(csp));
  });

  test('le intestazioni delle pagine non si sovrappongono a quelle dell’API (già inviate da Express)', () => {
    const regex = new RegExp(`^${config.headers[0].source.replace(/^\//, '/')}$`);
    assert.ok(regex.test('/mappa') && regex.test('/'), 'valgono per le pagine');
    assert.ok(!regex.test('/api/v1/health') && !regex.test('/api/v1/segnalazioni'), 'non valgono per l’API');
    const chiavi = config.headers[0].headers.map((h) => h.key);
    for (const richiesta of ['Referrer-Policy', 'X-Content-Type-Options', 'X-Frame-Options', 'Permissions-Policy']) assert.ok(chiavi.includes(richiesta), richiesta);
    const permessi = config.headers[0].headers.find((h) => h.key === 'Permissions-Policy').value;
    assert.match(permessi, /geolocation=\(self\)/, 'la posizione serve alla mappa');
  });

  test('il cron di manutenzione punta all’endpoint reale, al massimo una volta al giorno', () => {
    assert.equal(config.crons.length, 1);
    assert.equal(config.crons[0].path, '/api/v1/interno/manutenzione');
    assert.match(config.crons[0].schedule, /^\d+ \d+ \* \* \*$/, 'piano gratuito: una volta al giorno');
  });
});

describe('Cartella statica generata (npm run build:vercel)', () => {
  before(async () => {
    await preparaPublic({ log: () => {} });
  });

  test('contiene pagine, mappa e il pacchetto per il caricamento diretto', async () => {
    for (const file of ['index.html', 'nuova-segnalazione.html', '404.html', 'css/style.css', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/leaflet/images/marker-icon.png', 'js/vendor/blob-client.js']) {
      await fs.access(path.join(ROOT_DIR, 'public', file));
    }
    const pacchetto = await fs.readFile(path.join(ROOT_DIR, 'public/js/vendor/blob-client.js'), 'utf8');
    assert.match(pacchetto, /blob\.generate-client-token/, 'contiene il protocollo di caricamento diretto');
    assert.match(pacchetto, /export\s*\{[^}]*\bupload\b/, 'esporta upload');
    assert.match(pacchetto, /export\s*\{[^}]*\buploadPresigned\b/, 'esporta uploadPresigned');
  });

  test('ogni file a cui le pagine rimandano esiste (nessun collegamento rotto)', async () => {
    const nomi = (await fs.readdir(path.join(ROOT_DIR, 'public'))).filter((f) => f.endsWith('.html'));
    assert.ok(nomi.length >= 13);
    const mancanti = [];
    for (const nome of nomi) {
      const html = await fs.readFile(path.join(ROOT_DIR, 'public', nome), 'utf8');
      for (const [, valore] of html.matchAll(/(?:href|src)="(\/[^"#?]+)"/g)) {
        if (valore.startsWith('/api/')) continue;
        const esiste = await fs.access(path.join(ROOT_DIR, 'public', valore)).then(() => true).catch(() => false)
          || await fs.access(path.join(ROOT_DIR, 'public', `${valore}.html`)).then(() => true).catch(() => false);
        if (!esiste) mancanti.push(`${nome} → ${valore}`);
      }
    }
    assert.deepEqual(mancanti, []);
  });

  test('i moduli JavaScript importati esistono (compreso il pacchetto caricato in modo dinamico)', async () => {
    const mancanti = [];
    const radice = path.join(ROOT_DIR, 'public/js');
    const visita = async (cartella) => {
      for (const voce of await fs.readdir(cartella, { withFileTypes: true })) {
        const completo = path.join(cartella, voce.name);
        if (voce.isDirectory()) {
          if (voce.name !== 'vendor') await visita(completo);
        } else if (voce.name.endsWith('.js')) {
          const testo = await fs.readFile(completo, 'utf8');
          for (const [, rif] of testo.matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)) {
            const destinazione = rif.startsWith('/') ? path.join(ROOT_DIR, 'public', rif) : path.resolve(path.dirname(completo), rif);
            if (!(await fs.access(destinazione).then(() => true).catch(() => false))) mancanti.push(`${path.relative(radice, completo)} → ${rif}`);
          }
        }
      }
    };
    await visita(radice);
    assert.deepEqual(mancanti, []);
  });
});
