import { pool } from '../config/db.js';

export async function insert(idUtente, idSegnalazione, db = pool) {
  await db.execute('INSERT INTO sostegno (id_utente, id_segnalazione) VALUES (?, ?)', [idUtente, idSegnalazione]);
}

export async function remove(idUtente, idSegnalazione, db = pool) {
  const [r] = await db.execute('DELETE FROM sostegno WHERE id_utente = ? AND id_segnalazione = ?', [idUtente, idSegnalazione]);
  return r.affectedRows;
}

/** Il conteggio è sempre ricavato dai record effettivi (RF09). */
export async function conta(idSegnalazione, db = pool) {
  const [[{ totale }]] = await db.execute('SELECT COUNT(*) AS totale FROM sostegno WHERE id_segnalazione = ?', [idSegnalazione]);
  return totale;
}
