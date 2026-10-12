// Svuota i contenuti del sito mantenendo utenti, categorie, quartieri e stati.
// Elimina: segnalazioni (con allegati, categorie assegnate, sostegni, cronologia e analisi),
// coda delle analisi e contatori dei limiti di richieste. Opzione --azzera-log: anche il registro delle operazioni.
// Resta tutto il resto: utenti e ruoli, sessioni, categorie, quartieri, stati, migrazioni.
//
// Uso: npm run db:svuota            (database di .env)
//      npm run db:svuota:remoto     (database di .env.production)
// Mostra quanto verrebbe eliminato e chiede di scrivere il nome del database per confermare.
// I file di foto e video NON si cancellano da qui con Vercel Blob: vedi il messaggio finale.
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import mysql from 'mysql2/promise';
import { opzioniMysql } from '../src/config/dbOptions.js';
import { env } from '../src/config/env.js';

// Si elimina solo "segnalazione": allegati, categorie assegnate, sostegni, cronologia e analisi seguono
// a cascata (le chiavi esterne non attivano i trigger che impediscono di togliere l'ultimo allegato o
// l'ultima categoria di una segnalazione pubblicata, mentre un DELETE esplicito li attiverebbe).
const TABELLE = ['analisi_ia', 'job_elaborazione', 'storico_stato', 'sostegno', 'segnalazione_categoria', 'allegato', 'segnalazione'];
const SOLO_SE_RICHIESTO = ['log_operazione'];
const SEMPRE = ['limite_richieste'];

/** Conta le righe di ogni tabella che verrebbe svuotata. */
export async function conteggi(conn, { azzeraLog = false } = {}) {
  const risultato = {};
  for (const t of [...TABELLE, ...SEMPRE, ...(azzeraLog ? SOLO_SE_RICHIESTO : [])]) {
    const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
    risultato[t] = Number(n);
  }
  return risultato;
}

/** Percorsi dei file allegati nell'archivio (da eliminare a parte). */
export async function percorsiFile(conn) {
  const [righe] = await conn.query('SELECT percorso_file FROM allegato');
  return righe.map((r) => r.percorso_file);
}

/** Elimina i contenuti in una transazione: o tutto o niente. */
export async function svuota(conn, { azzeraLog = false } = {}) {
  await conn.beginTransaction();
  try {
    await conn.query('DELETE FROM segnalazione');
    for (const t of [...SEMPRE, ...(azzeraLog ? SOLO_SE_RICHIESTO : [])]) await conn.query(`DELETE FROM \`${t}\``);
    for (const t of TABELLE) {
      const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
      if (Number(n) !== 0) throw new Error(`La tabella ${t} non è stata svuotata: operazione annullata.`);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  }
  // I numeri riprendono da 1 (non si può nella transazione: ALTER TABLE chiude la transazione).
  for (const t of [...TABELLE, ...(azzeraLog ? SOLO_SE_RICHIESTO : [])]) await conn.query(`ALTER TABLE \`${t}\` AUTO_INCREMENT = 1`);
}

async function main() {
  const { values } = parseArgs({ options: { 'azzera-log': { type: 'boolean', default: false } } });
  const azzeraLog = values['azzera-log'];

  const conn = await mysql.createConnection(opzioniMysql());
  const terminale = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const [[{ utenti }]] = await conn.query('SELECT COUNT(*) AS utenti FROM utente');
    const dati = await conteggi(conn, { azzeraLog });
    const files = await percorsiFile(conn);
    console.log(`\nDatabase: ${env.DB_NAME} su ${env.DB_HOST}\n`);
    console.log('Verranno ELIMINATI:');
    for (const [t, n] of Object.entries(dati)) console.log(`  ${t.padEnd(24)} ${n}`);
    console.log(`\nResteranno: ${utenti} utenti (con ruoli e sessioni), categorie, quartieri e stati${azzeraLog ? '' : ', registro delle operazioni'}.`);
    console.log(`File di allegati collegati: ${files.length}.\n`);

    const risposta = (await terminale.question(`Per confermare scrivi il nome del database (${env.DB_NAME}), altrimenti premi Invio per annullare: `).catch(() => '')).trim();
    if (risposta !== env.DB_NAME) {
      console.log('Annullato: non è stato eliminato nulla.');
      return;
    }
    await svuota(conn, { azzeraLog });
    console.log('\nFatto: contenuti eliminati, utenti mantenuti.');
    if (files.length) {
      console.log('\nAttenzione: foto e video restano nell\'archivio. Se usi Vercel Blob:');
      console.log('  Vercel → progetto → Storage → il tuo store Blob → seleziona i file → Delete.');
      console.log('  (in locale, con UPLOAD_DIR, puoi svuotare la cartella "uploads")');
    }
  } finally {
    terminale.close();
    await conn.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
