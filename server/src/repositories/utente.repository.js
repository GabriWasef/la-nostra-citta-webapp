import { pool } from '../config/db.js';

const COLONNE_PUBBLICHE = `u.id_utente, u.nome, u.cognome, u.email, u.ruolo, u.stato_account,
  u.id_quartiere_residenza, q.nome AS quartiere_residenza,
  u.data_registrazione, u.data_consenso_privacy, u.data_ultimo_accesso`;

const FROM = 'FROM utente u LEFT JOIN quartiere q ON q.id_quartiere = u.id_quartiere_residenza';

export async function findById(id, db = pool) {
  const [righe] = await db.execute(`SELECT ${COLONNE_PUBBLICHE} ${FROM} WHERE u.id_utente = ?`, [id]);
  return righe[0] ?? null;
}

export async function findCredenzialiByEmail(email, db = pool) {
  const [righe] = await db.execute(
    'SELECT id_utente, password_hash, stato_account FROM utente WHERE email = ?',
    [email],
  );
  return righe[0] ?? null;
}

export async function findPasswordHash(id, db = pool) {
  const [righe] = await db.execute('SELECT password_hash FROM utente WHERE id_utente = ?', [id]);
  return righe[0]?.password_hash ?? null;
}

export async function create({ nome, cognome, email, passwordHash, idQuartiere, ruolo = 'CITTADINO' }, db = pool) {
  const [r] = await db.execute(
    `INSERT INTO utente (nome, cognome, email, password_hash, ruolo, id_quartiere_residenza, data_consenso_privacy)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [nome, cognome, email, passwordHash, ruolo, idQuartiere ?? null],
  );
  return r.insertId;
}

const CAMPI_PROFILO = ['nome', 'cognome', 'id_quartiere_residenza'];

export async function updateProfilo(id, dati, db = pool) {
  const campi = CAMPI_PROFILO.filter((c) => dati[c] !== undefined);
  if (!campi.length) return;
  await db.execute(
    `UPDATE utente SET ${campi.map((c) => `${c} = ?`).join(', ')} WHERE id_utente = ?`,
    [...campi.map((c) => dati[c]), id],
  );
}

export async function updatePassword(id, passwordHash, db = pool) {
  await db.execute('UPDATE utente SET password_hash = ? WHERE id_utente = ?', [passwordHash, id]);
}

export async function registraAccesso(id, db = pool) {
  await db.execute('UPDATE utente SET data_ultimo_accesso = CURRENT_TIMESTAMP WHERE id_utente = ?', [id]);
}

/** Disattivazione con anonimizzazione dei dati personali (privacy). */
export async function anonimizza(id, passwordHashCasuale, db = pool) {
  await db.execute(
    `UPDATE utente
        SET nome = 'Utente', cognome = 'Eliminato', email = ?, password_hash = ?,
            id_quartiere_residenza = NULL, stato_account = 'ELIMINATO'
      WHERE id_utente = ?`,
    [`eliminato-${id}@anonimo.invalid`, passwordHashCasuale, id],
  );
}

export async function cerca({ q, ruolo, stato_account, pagina, perPagina }, db = pool) {
  const where = [];
  const params = [];
  if (q) {
    where.push("(u.email LIKE ? OR CONCAT(u.nome, ' ', u.cognome) LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (ruolo) {
    where.push('u.ruolo = ?');
    params.push(ruolo);
  }
  if (stato_account) {
    where.push('u.stato_account = ?');
    params.push(stato_account);
  }
  const clausola = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ totale }]] = await db.execute(`SELECT COUNT(*) AS totale ${FROM} ${clausola}`, params);
  const [righe] = await db.execute(
    `SELECT ${COLONNE_PUBBLICHE},
            (SELECT COUNT(*) FROM segnalazione s WHERE s.id_autore = u.id_utente) AS numero_segnalazioni
       ${FROM} ${clausola}
      ORDER BY u.data_registrazione DESC, u.id_utente DESC
      LIMIT ? OFFSET ?`,
    [...params, String(perPagina), String((pagina - 1) * perPagina)],
  );
  return { righe, totale };
}

export async function updateRuoloStato(id, { ruolo, stato_account }, db = pool) {
  const campi = [];
  const params = [];
  if (ruolo) {
    campi.push('ruolo = ?');
    params.push(ruolo);
  }
  if (stato_account) {
    campi.push('stato_account = ?');
    params.push(stato_account);
  }
  await db.execute(`UPDATE utente SET ${campi.join(', ')} WHERE id_utente = ?`, [...params, id]);
}
