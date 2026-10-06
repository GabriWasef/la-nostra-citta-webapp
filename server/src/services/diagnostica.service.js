// Controlli di configurazione per l'amministratore: utili soprattutto dopo il primo deploy,
// per capire in un colpo solo se database, archivio degli allegati e servizi esterni funzionano.
import crypto from 'node:crypto';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { migrazioniInSospeso } from '../config/migrazioni.js';
import { storage } from '../storage/index.js';
import * as geocodifica from './geocodifica.service.js';

// PNG 1x1 trasparente.
const PNG_PROVA = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function controllo(nome, fn) {
  const inizio = Date.now();
  try {
    const dettaglio = await fn();
    return { nome, ok: dettaglio?.ok ?? true, dettaglio: dettaglio?.testo ?? dettaglio ?? 'ok', ms: Date.now() - inizio };
  } catch (err) {
    return { nome, ok: false, dettaglio: err.message, ms: Date.now() - inizio };
  }
}

async function provaArchivio() {
  const oggi = new Date();
  const chiave = `${oggi.getUTCFullYear()}/${String(oggi.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.png`;
  const passi = [];
  try {
    await storage.saveBuffer(chiave, PNG_PROVA, { tipoMime: 'image/png' });
    passi.push('scrittura');
    const letto = await storage.leggi(chiave);
    if (!letto.equals(PNG_PROVA)) throw new Error('il file letto non coincide con quello scritto');
    passi.push('lettura');
    const url = await storage.urlFirmato(chiave);
    if (url) {
      const risposta = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!risposta.ok) throw new Error(`il link firmato risponde ${risposta.status}`);
      const byte = Buffer.from(await risposta.arrayBuffer());
      if (!byte.equals(PNG_PROVA)) throw new Error('il file scaricato dal link firmato non coincide');
      passi.push('link firmato');
    }
  } finally {
    await storage.remove(chiave).then(() => passi.push('eliminazione')).catch(() => {});
  }
  return { ok: true, testo: `archivio "${storage.tipo}": ${passi.join(', ')}` };
}

export async function eseguiDiagnostica() {
  const controlli = [
    await controllo('Database', async () => {
      const [[r]] = await pool.query('SELECT VERSION() AS versione');
      const [[cifrario]] = await pool.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
      const cifrata = Boolean(cifrario?.Value);
      const [[c]] = await pool.query('SELECT COUNT(*) AS n FROM utente');
      const testo = `MySQL ${r.versione}, connessione cifrata: ${cifrata ? 'sì' : 'no'}, utenti: ${c.n}`;
      return env.isProduction && !cifrata
        ? { ok: false, testo: `${testo}. Con un database in cloud imposta DB_SSL=true.` }
        : testo;
    }),
    await controllo('Migrazioni', async () => {
      const mancanti = await migrazioniInSospeso(pool);
      return mancanti.length
        ? { ok: false, testo: `da applicare: ${mancanti.join(', ')} (esegui npm run db:migrate verso questo database)` }
        : 'tutte applicate';
    }),
    await controllo('Archivio degli allegati', provaArchivio),
    await controllo('Ricerca degli indirizzi', async () => {
      if (!env.GEOCODING_ENABLED) return { ok: false, testo: 'disattivata (GEOCODING_ENABLED=false)' };
      const r = await geocodifica.cerca('Piazza del Duomo');
      return r.length ? `Nominatim raggiungibile (${r.length} risultati)` : { ok: false, testo: 'raggiungibile ma senza risultati' };
    }),
    await controllo('Manutenzione periodica', async () =>
      env.CRON_SECRET
        ? 'CRON_SECRET impostato'
        : { ok: false, testo: 'CRON_SECRET non impostato: analisi in coda e pulizie non partiranno dal cron' },
    ),
    await controllo('Indirizzo del sito', async () =>
      env.isProduction && !env.APP_ORIGIN.startsWith('https://')
        ? { ok: false, testo: `APP_ORIGIN è ${env.APP_ORIGIN}: in produzione deve essere https` }
        : env.APP_ORIGIN,
    ),
  ];
  return {
    ambiente: {
      vercel: env.isVercel,
      node: process.version,
      node_env: env.NODE_ENV,
      archivio: storage.tipo,
      limiti_frequenza: env.rateLimitStore,
      geocodifica: env.GEOCODING_ENABLED ? env.GEOCODING_URL : 'disattivata',
    },
    controlli,
    ok: controlli.every((c) => c.ok),
  };
}
