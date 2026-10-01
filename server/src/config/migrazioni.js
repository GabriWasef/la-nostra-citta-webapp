// Stato del database rispetto alle migrazioni: usato dallo script
// db:migrate e dal server all'avvio.
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT_DIR } from './env.js';

export const MIGRATIONS_DIR = path.join(ROOT_DIR, 'database/migrations');
export const MIGRAZIONE_INIZIALE = '001_schema_iniziale.sql';

// Funzionalità usate dallo schema: collation utf8mb4_0900 (8.0), CHECK (8.0.16),
// alias di riga in INSERT ... ON DUPLICATE KEY UPDATE (8.0.19).
const VERSIONE_MINIMA = [8, 0, 19];

export async function fileMigrazioni() {
  return (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
}

/** Lancia un errore comprensibile se il server non è MySQL 8.0.19 o superiore. */
export function verificaVersione(versione) {
  if (/mariadb/i.test(versione)) {
    throw new Error(
      `Il server del database è MariaDB (${versione}), ma il progetto richiede MySQL 8.0.19 o superiore ` +
        '(collation utf8mb4_0900_ai_ci, vincoli CHECK, trigger). Installa MySQL 8 (es. MySQL Community Server) ' +
        'oppure usa il MySQL del docker-compose.yml. Attenzione: XAMPP include MariaDB, non MySQL.',
    );
  }
  const numeri = (versione.match(/^(\d+)\.(\d+)\.(\d+)/) ?? []).slice(1).map(Number);
  if (numeri.length !== 3) return; // formato sconosciuto: non si blocca
  const i = numeri.findIndex((n, k) => n !== VERSIONE_MINIMA[k]);
  if (i !== -1 && numeri[i] < VERSIONE_MINIMA[i]) {
    throw new Error(`MySQL ${versione} non è supportato: serve MySQL 8.0.19 o superiore.`);
  }
}

async function esisteTabella(db, nome) {
  const [righe] = await db.query(
    'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [nome],
  );
  return righe.length > 0;
}

/** Migrazioni già applicate (insieme vuoto se la tabella di controllo non esiste). */
export async function migrazioniApplicate(db) {
  if (!(await esisteTabella(db, 'schema_migrazioni'))) return new Set();
  const [righe] = await db.query('SELECT nome FROM schema_migrazioni');
  return new Set(righe.map((r) => r.nome));
}

/**
 * Il database è stato creato eseguendo a mano lo script ufficiale
 * (database/schema/...): le tabelle esistono ma la 001 non è registrata.
 */
export async function schemaUfficialePresente(db) {
  for (const tabella of ['utente', 'segnalazione', 'stato_segnalazione', 'analisi_ia']) {
    if (!(await esisteTabella(db, tabella))) return false;
  }
  return true;
}

export async function migrazioniInSospeso(db) {
  const applicate = await migrazioniApplicate(db);
  return (await fileMigrazioni()).filter((f) => !applicate.has(f));
}
