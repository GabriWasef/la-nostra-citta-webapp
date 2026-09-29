// Quartieri, categorie e stati: tabelle di riferimento con poche righe.
import { pool } from '../config/db.js';

/** UPDATE con whitelist delle colonne modificabili. */
async function aggiorna(tabella, colonnaId, colonne, id, dati, db) {
  const campi = colonne.filter((c) => dati[c] !== undefined);
  if (!campi.length) return 0;
  const [r] = await db.execute(
    `UPDATE ${tabella} SET ${campi.map((c) => `${c} = ?`).join(', ')} WHERE ${colonnaId} = ?`,
    [...campi.map((c) => dati[c]), id],
  );
  return r.affectedRows;
}

// ---- Quartieri
export async function listQuartieri(db = pool) {
  const [righe] = await db.execute(
    `SELECT q.id_quartiere, q.nome, q.descrizione, q.municipio,
            (SELECT COUNT(*) FROM segnalazione s WHERE s.id_quartiere = q.id_quartiere) AS numero_segnalazioni
       FROM quartiere q ORDER BY q.nome`,
  );
  return righe;
}

export async function findQuartiere(id, db = pool) {
  const [righe] = await db.execute('SELECT id_quartiere, nome, descrizione, municipio FROM quartiere WHERE id_quartiere = ?', [id]);
  return righe[0] ?? null;
}

export async function createQuartiere({ nome, descrizione, municipio }, db = pool) {
  const [r] = await db.execute('INSERT INTO quartiere (nome, descrizione, municipio) VALUES (?, ?, ?)', [nome, descrizione, municipio]);
  return r.insertId;
}

export const updateQuartiere = (id, dati, db = pool) =>
  aggiorna('quartiere', 'id_quartiere', ['nome', 'descrizione', 'municipio'], id, dati, db);

export async function deleteQuartiere(id, db = pool) {
  const [r] = await db.execute('DELETE FROM quartiere WHERE id_quartiere = ?', [id]);
  return r.affectedRows;
}

// ---- Categorie
export async function listCategorie(db = pool) {
  const [righe] = await db.execute(
    `SELECT c.id_categoria, c.nome, c.descrizione,
            (SELECT COUNT(*) FROM segnalazione_categoria sc WHERE sc.id_categoria = c.id_categoria) AS numero_segnalazioni
       FROM categoria c ORDER BY c.nome`,
  );
  return righe;
}

export async function findCategoria(id, db = pool) {
  const [righe] = await db.execute('SELECT id_categoria, nome, descrizione FROM categoria WHERE id_categoria = ?', [id]);
  return righe[0] ?? null;
}

export async function createCategoria({ nome, descrizione }, db = pool) {
  const [r] = await db.execute('INSERT INTO categoria (nome, descrizione) VALUES (?, ?)', [nome, descrizione]);
  return r.insertId;
}

export const updateCategoria = (id, dati, db = pool) =>
  aggiorna('categoria', 'id_categoria', ['nome', 'descrizione'], id, dati, db);

export async function deleteCategoria(id, db = pool) {
  const [r] = await db.execute('DELETE FROM categoria WHERE id_categoria = ?', [id]);
  return r.affectedRows;
}

// ---- Stati
export async function listStati(db = pool) {
  const [righe] = await db.execute(
    'SELECT id_stato, codice, nome, descrizione, ordine, pubblica, finale FROM stato_segnalazione ORDER BY ordine',
  );
  return righe.map((r) => ({ ...r, pubblica: Boolean(r.pubblica), finale: Boolean(r.finale) }));
}

export async function findStatoByCodice(codice, db = pool) {
  const [righe] = await db.execute(
    'SELECT id_stato, codice, nome, pubblica, finale FROM stato_segnalazione WHERE codice = ?',
    [codice],
  );
  return righe[0] ?? null;
}

export const updateStato = (id, dati, db = pool) =>
  aggiorna('stato_segnalazione', 'id_stato', ['nome', 'descrizione'], id, dati, db);
