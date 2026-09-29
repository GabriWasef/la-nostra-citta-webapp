import { pool } from '../config/db.js';

export async function insert(a, db = pool) {
  const [r] = await db.execute(
    `INSERT INTO analisi_ia (tipo_analisi, modello, risultato, punteggio, esito, id_segnalazione, id_allegato)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      a.tipo_analisi, a.modello, JSON.stringify(a.risultato), a.punteggio ?? null, a.esito ?? null,
      a.id_segnalazione ?? null, a.id_allegato ?? null,
    ],
  );
  return r.insertId;
}

/** Analisi della segnalazione e dei suoi allegati. */
export async function listBySegnalazione(idSegnalazione, db = pool) {
  const [righe] = await db.execute(
    `SELECT ai.id_analisi, ai.tipo_analisi, ai.modello, ai.risultato, ai.punteggio, ai.esito,
            ai.data_analisi, ai.id_allegato, ai.esito_revisione, ai.data_revisione,
            CONCAT(u.nome, ' ', u.cognome) AS revisore
       FROM analisi_ia ai
       LEFT JOIN allegato a ON a.id_allegato = ai.id_allegato
       LEFT JOIN utente u ON u.id_utente = ai.id_revisore
      WHERE ai.id_segnalazione = ? OR a.id_segnalazione = ?
      ORDER BY ai.data_analisi, ai.id_analisi`,
    [idSegnalazione, idSegnalazione],
  );
  return righe;
}

export async function findById(id, db = pool) {
  const [righe] = await db.execute(
    `SELECT ai.id_analisi, ai.tipo_analisi, COALESCE(ai.id_segnalazione, a.id_segnalazione) AS id_segnalazione
       FROM analisi_ia ai LEFT JOIN allegato a ON a.id_allegato = ai.id_allegato
      WHERE ai.id_analisi = ?`,
    [id],
  );
  return righe[0] ?? null;
}

export async function revisiona(id, esitoRevisione, idRevisore, db = pool) {
  await db.execute(
    'UPDATE analisi_ia SET esito_revisione = ?, id_revisore = ?, data_revisione = CURRENT_TIMESTAMP WHERE id_analisi = ?',
    [esitoRevisione, idRevisore, id],
  );
}

/** Chiude le revisioni pendenti di un tipo di analisi (es. quando il moderatore corregge le categorie). */
export async function revisionaPendenti(idSegnalazione, tipoAnalisi, esitoRevisione, idRevisore, db = pool) {
  await db.execute(
    `UPDATE analisi_ia SET esito_revisione = ?, id_revisore = ?, data_revisione = CURRENT_TIMESTAMP
      WHERE id_segnalazione = ? AND tipo_analisi = ? AND esito_revisione IS NULL`,
    [esitoRevisione, idRevisore, idSegnalazione, tipoAnalisi],
  );
}

// ---- Coda di elaborazione asincrona (job_elaborazione)

export async function accoda({ tipo_analisi, id_segnalazione, id_allegato = null }, db = pool) {
  await db.execute(
    'INSERT INTO job_elaborazione (tipo_analisi, id_segnalazione, id_allegato) VALUES (?, ?, ?)',
    [tipo_analisi, id_segnalazione, id_allegato],
  );
}

/**
 * Prende in carico il prossimo job. SKIP LOCKED consente di avviare più
 * worker in parallelo senza che due elaborino lo stesso job.
 */
export async function prendiJob(conn) {
  await conn.beginTransaction();
  try {
    const [righe] = await conn.execute(
      `SELECT id_job, tipo_analisi, tentativi, id_segnalazione, id_allegato FROM job_elaborazione
        WHERE stato = 'IN_CODA' ORDER BY id_job LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    const job = righe[0] ?? null;
    if (job) {
      await conn.execute(
        "UPDATE job_elaborazione SET stato = 'IN_CORSO', tentativi = tentativi + 1 WHERE id_job = ?",
        [job.id_job],
      );
    }
    await conn.commit();
    return job;
  } catch (err) {
    await conn.rollback();
    throw err;
  }
}

export async function completaJob(idJob, db = pool) {
  await db.execute("UPDATE job_elaborazione SET stato = 'COMPLETATO', ultimo_errore = NULL WHERE id_job = ?", [idJob]);
}

export async function fallisciJob(idJob, errore, riprova, db = pool) {
  await db.execute('UPDATE job_elaborazione SET stato = ?, ultimo_errore = ? WHERE id_job = ?', [
    riprova ? 'IN_CODA' : 'ERRORE',
    String(errore).slice(0, 2000),
    idJob,
  ]);
}
