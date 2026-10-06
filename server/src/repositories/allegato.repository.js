import { pool } from '../config/db.js';

export async function insert(a, db = pool) {
  const [r] = await db.execute(
    `INSERT INTO allegato
       (nome_file, percorso_file, tipo_mime, tipo_media, dimensione_bytes, hash_sha256,
        latitudine_exif, longitudine_exif, id_segnalazione)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      a.nome_file, a.percorso_file, a.tipo_mime, a.tipo_media, a.dimensione_bytes, a.hash_sha256,
      a.latitudine_exif ?? null, a.longitudine_exif ?? null, a.id_segnalazione,
    ],
  );
  return r.insertId;
}

export async function findById(id, db = pool) {
  const [righe] = await db.execute(
    `SELECT id_allegato, nome_file, percorso_file, tipo_mime, tipo_media, dimensione_bytes,
            latitudine_exif, longitudine_exif, data_caricamento, id_segnalazione
       FROM allegato WHERE id_allegato = ?`,
    [id],
  );
  return righe[0] ?? null;
}

export async function listBySegnalazione(idSegnalazione, db = pool) {
  const [righe] = await db.execute(
    `SELECT id_allegato, nome_file, tipo_mime, tipo_media, dimensione_bytes,
            latitudine_exif, longitudine_exif, data_caricamento
       FROM allegato WHERE id_segnalazione = ? ORDER BY id_allegato`,
    [idSegnalazione],
  );
  return righe;
}

export async function remove(id, db = pool) {
  const [r] = await db.execute('DELETE FROM allegato WHERE id_allegato = ?', [id]);
  return r.affectedRows;
}

/** Percorsi dei file di una segnalazione nell'archivio (per eliminarli insieme alla segnalazione). */
export async function percorsiPer(idSegnalazione, db = pool) {
  const [righe] = await db.execute('SELECT percorso_file FROM allegato WHERE id_segnalazione = ?', [idSegnalazione]);
  return righe.map((r) => r.percorso_file);
}
