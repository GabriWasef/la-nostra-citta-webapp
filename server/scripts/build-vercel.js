// Prepara la cartella "public" servita come sito statico da Vercel:
//   1. copia il frontend (client/);
//   2. copia Leaflet (la mappa) in /vendor/leaflet, come fa Express in locale;
//   3. impacchetta la libreria di caricamento diretto di Vercel Blob per il browser.
// Uso: npm run build:vercel  (Vercel lo esegue da solo a ogni deploy, vedi vercel.json)
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { ROOT_DIR } from '../src/config/env-percorsi.js';

const SORGENTE = path.join(ROOT_DIR, 'client');
const DESTINAZIONE = path.join(ROOT_DIR, 'public');
const LEAFLET = path.join(ROOT_DIR, 'node_modules/leaflet/dist');

export async function preparaPublic({ log = console.log } = {}) {
  await rm(DESTINAZIONE, { recursive: true, force: true });
  await cp(SORGENTE, DESTINAZIONE, { recursive: true });
  log('Frontend copiato in public/');

  const destinazioneLeaflet = path.join(DESTINAZIONE, 'vendor/leaflet');
  await mkdir(destinazioneLeaflet, { recursive: true });
  for (const file of ['leaflet.css', 'leaflet.js']) await cp(path.join(LEAFLET, file), path.join(destinazioneLeaflet, file));
  await cp(path.join(LEAFLET, 'images'), path.join(destinazioneLeaflet, 'images'), { recursive: true });
  log('Leaflet copiato in public/vendor/leaflet');

  const uscita = path.join(DESTINAZIONE, 'js/vendor/blob-client.js');
  await build({
    entryPoints: [path.join(ROOT_DIR, 'server/scripts/blob-client.entry.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    outfile: uscita,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  });
  const { size } = await stat(uscita);
  log(`Libreria di caricamento diretto impacchettata (${(size / 1024).toFixed(0)} KB)`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build-vercel.js')) {
  preparaPublic().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
