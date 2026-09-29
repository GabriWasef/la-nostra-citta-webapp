// Token di recupero password e registro delle operazioni.
import { pool } from '../config/db.js';

export async function creaToken(idUtente, tokenHash, scadenza, db = pool) {
  // Un solo token valido per utente: i precedenti vengono invalidati.
  await db.execute(
    'UPDATE token_recupero_password SET data_utilizzo = CURRENT_TIMESTAMP WHERE id_utente = ? AND data_utilizzo IS NULL',
    [idUtente],
  );
  await db.execute(
    'INSERT INTO token_recupero_password (id_utente, token_hash, data_scadenza) VALUES (?, ?, ?)',
    [idUtente, tokenHash, scadenza],
  );
}

export async function trovaTokenValido(tokenHash, db = pool) {
  const [righe] = await db.execute(
    `SELECT id_token, id_utente FROM token_recupero_password
      WHERE token_hash = ? AND data_utilizzo IS NULL AND data_scadenza > CURRENT_TIMESTAMP`,
    [tokenHash],
  );
  return righe[0] ?? null;
}

export async function usaToken(idToken, db = pool) {
  await db.execute('UPDATE token_recupero_password SET data_utilizzo = CURRENT_TIMESTAMP WHERE id_token = ?', [idToken]);
}

export async function registraOperazione({ idUtente, azione, entita, idEntita, dettagli, ip }, db = pool) {
  await db.execute(
    `INSERT INTO log_operazione (id_utente, azione, entita, id_entita, dettagli, indirizzo_ip)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [idUtente ?? null, azione, entita ?? null, idEntita ?? null, dettagli ? JSON.stringify(dettagli) : null, ip ?? null],
  );
}

export async function listOperazioni({ pagina, perPagina }, db = pool) {
  const [[{ totale }]] = await db.execute('SELECT COUNT(*) AS totale FROM log_operazione');
  const [righe] = await db.execute(
    `SELECT l.id_log, l.data_operazione, l.azione, l.entita, l.id_entita, l.dettagli, l.indirizzo_ip,
            l.id_utente, CONCAT(u.nome, ' ', u.cognome) AS utente
       FROM log_operazione l LEFT JOIN utente u ON u.id_utente = l.id_utente
      ORDER BY l.id_log DESC LIMIT ? OFFSET ?`,
    [String(perPagina), String((pagina - 1) * perPagina)],
  );
  return { righe, totale };
}
