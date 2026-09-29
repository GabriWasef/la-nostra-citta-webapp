import { pool } from '../config/db.js';

const segnaposti = (n) => Array(n).fill('?').join(', ');

/**
 * Colonne comuni a elenchi e dettaglio. L'autore è mostrato solo se la
 * visibilità non è ANONIMA: la regola sui dati esposti è comunque
 * applicata dal service, che conosce chi sta guardando.
 */
const SELECT_BASE = `
  SELECT s.id_segnalazione, s.titolo, s.descrizione, s.data_inserimento, s.data_aggiornamento,
         s.latitudine, s.longitudine, s.origine_coordinate, s.indirizzo, s.visibilita,
         s.id_autore, CONCAT(u.nome, ' ', u.cognome) AS nome_autore,
         s.id_quartiere, q.nome AS quartiere,
         st.id_stato, st.codice AS codice_stato, st.nome AS stato, st.pubblica, st.finale,
         (SELECT COUNT(*) FROM sostegno so WHERE so.id_segnalazione = s.id_segnalazione) AS numero_sostegni,
         EXISTS (SELECT 1 FROM sostegno so WHERE so.id_segnalazione = s.id_segnalazione AND so.id_utente = ?) AS sostenuta,
         EXISTS (SELECT 1 FROM analisi_ia ai
                  WHERE ai.id_segnalazione = s.id_segnalazione
                    AND ai.esito IN ('DA_REVISIONARE', 'BLOCCATO') AND ai.esito_revisione IS NULL) AS da_revisionare_ia
    FROM segnalazione s
    JOIN utente u ON u.id_utente = s.id_autore
    JOIN quartiere q ON q.id_quartiere = s.id_quartiere
    JOIN stato_segnalazione st ON st.id_stato = s.id_stato_corrente`;

const ORDINAMENTI = {
  recenti: 's.data_inserimento DESC, s.id_segnalazione DESC',
  meno_recenti: 's.data_inserimento ASC, s.id_segnalazione ASC',
  sostegni: 'numero_sostegni DESC, s.data_inserimento DESC, s.id_segnalazione DESC',
};

/** Converte il testo libero in una ricerca FULLTEXT in modalità booleana sicura. */
export function testoRicerca(q) {
  const parole = q
    .split(/[^\p{L}\p{N}]+/u)
    .filter((p) => p.length >= 3)
    .slice(0, 8);
  return parole.length ? parole.map((p) => `${p}*`).join(' ') : null;
}

function normalizza(r) {
  return {
    ...r,
    pubblica: Boolean(r.pubblica),
    finale: Boolean(r.finale),
    sostenuta: Boolean(r.sostenuta),
    da_revisionare_ia: Boolean(r.da_revisionare_ia),
  };
}

/**
 * Ricerca con filtri e paginazione.
 * @param {object} filtri quartiere, categoria, stato, q, ordina, pagina, perPagina, soloConCoordinate
 * @param {{tipo: 'pubblico'|'autore'|'moderazione', idUtente?: number}} ambito
 * @param {number|null} idViewer utente che guarda (per il campo "sostenuta")
 */
export async function cerca(filtri, ambito, idViewer = null, db = pool) {
  const where = [];
  const params = [];

  if (ambito.tipo === 'pubblico') {
    where.push("st.pubblica = TRUE AND s.visibilita <> 'PRIVATA'");
  } else if (ambito.tipo === 'autore') {
    where.push('s.id_autore = ?');
    params.push(ambito.idUtente);
  }
  if (filtri.quartiere) {
    where.push('s.id_quartiere = ?');
    params.push(filtri.quartiere);
  }
  if (filtri.categoria) {
    where.push('EXISTS (SELECT 1 FROM segnalazione_categoria sc WHERE sc.id_segnalazione = s.id_segnalazione AND sc.id_categoria = ?)');
    params.push(filtri.categoria);
  }
  if (filtri.stato) {
    where.push('st.codice = ?');
    params.push(filtri.stato);
  }
  if (filtri.q) {
    const ricerca = testoRicerca(filtri.q);
    if (ricerca) {
      where.push('MATCH (s.titolo, s.descrizione) AGAINST (? IN BOOLEAN MODE)');
      params.push(ricerca);
    } else {
      where.push('s.titolo LIKE ?');
      params.push(`%${filtri.q}%`);
    }
  }
  if (filtri.soloConCoordinate) where.push('s.latitudine IS NOT NULL');

  const clausola = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ totale }]] = await db.execute(
    `SELECT COUNT(*) AS totale FROM segnalazione s
       JOIN stato_segnalazione st ON st.id_stato = s.id_stato_corrente ${clausola}`,
    params,
  );
  const [righe] = await db.execute(
    `${SELECT_BASE} ${clausola} ORDER BY ${ORDINAMENTI[filtri.ordina] ?? ORDINAMENTI.recenti} LIMIT ? OFFSET ?`,
    [idViewer, ...params, String(filtri.perPagina), String((filtri.pagina - 1) * filtri.perPagina)],
  );
  return { righe: righe.map(normalizza), totale };
}

export async function findById(id, idViewer = null, db = pool) {
  const [righe] = await db.execute(`${SELECT_BASE} WHERE s.id_segnalazione = ?`, [idViewer, id]);
  return righe[0] ? normalizza(righe[0]) : null;
}

/** Stato e visibilità: quanto basta per i controlli di accesso. */
export async function findAccesso(id, db = pool) {
  const [righe] = await db.execute(
    `SELECT s.id_segnalazione, s.id_autore, s.visibilita, st.codice AS codice_stato, st.nome AS stato, st.pubblica
       FROM segnalazione s JOIN stato_segnalazione st ON st.id_stato = s.id_stato_corrente
      WHERE s.id_segnalazione = ?`,
    [id],
  );
  return righe[0] ? { ...righe[0], pubblica: Boolean(righe[0].pubblica) } : null;
}

export async function insert(d, db = pool) {
  const [r] = await db.execute(
    `INSERT INTO segnalazione
       (titolo, descrizione, latitudine, longitudine, origine_coordinate, indirizzo, visibilita,
        id_autore, id_quartiere, id_stato_corrente)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      d.titolo, d.descrizione, d.latitudine, d.longitudine, d.origine_coordinate, d.indirizzo ?? null,
      d.visibilita, d.id_autore, d.id_quartiere, d.id_stato,
    ],
  );
  return r.insertId;
}

export async function updateStato(id, idStato, db = pool) {
  await db.execute('UPDATE segnalazione SET id_stato_corrente = ? WHERE id_segnalazione = ?', [idStato, id]);
}

// ---- Categorie della segnalazione

export async function categoriePer(ids, db = pool) {
  const mappa = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return mappa;
  const [righe] = await db.execute(
    `SELECT sc.id_segnalazione, c.id_categoria, c.nome, sc.origine_assegnazione, sc.affidabilita_ia
       FROM segnalazione_categoria sc JOIN categoria c ON c.id_categoria = sc.id_categoria
      WHERE sc.id_segnalazione IN (${segnaposti(ids.length)})
      ORDER BY c.nome`,
    ids,
  );
  for (const { id_segnalazione, ...cat } of righe) mappa.get(id_segnalazione)?.push(cat);
  return mappa;
}

export async function aggiungiCategorie(idSegnalazione, categorie, db = pool) {
  for (const { id_categoria, origine = 'MANUALE', affidabilita = null } of categorie) {
    await db.execute(
      `INSERT INTO segnalazione_categoria (id_segnalazione, id_categoria, origine_assegnazione, affidabilita_ia)
       VALUES (?, ?, ?, ?)`,
      [idSegnalazione, id_categoria, origine, affidabilita],
    );
  }
}

export async function rimuoviCategorie(idSegnalazione, idCategorie, db = pool) {
  if (!idCategorie.length) return;
  await db.execute(
    `DELETE FROM segnalazione_categoria WHERE id_segnalazione = ? AND id_categoria IN (${segnaposti(idCategorie.length)})`,
    [idSegnalazione, ...idCategorie],
  );
}

/** Primo allegato di ogni segnalazione, usato come copertina negli elenchi. */
export async function copertinePer(ids, db = pool) {
  const mappa = new Map();
  if (!ids.length) return mappa;
  const [righe] = await db.execute(
    `SELECT a.id_segnalazione, a.id_allegato, a.tipo_media
       FROM allegato a
      WHERE a.id_allegato IN (SELECT MIN(a2.id_allegato) FROM allegato a2
                               WHERE a2.id_segnalazione IN (${segnaposti(ids.length)})
                               GROUP BY a2.id_segnalazione)`,
    ids,
  );
  for (const r of righe) mappa.set(r.id_segnalazione, { id_allegato: r.id_allegato, tipo_media: r.tipo_media });
  return mappa;
}

// ---- Storico

export async function storico(id, db = pool) {
  const [righe] = await db.execute(
    `SELECT ss.id_storico, ss.data_cambio, ss.motivazione, st.codice AS codice_stato, st.nome AS stato,
            ss.id_utente_operatore, CONCAT(u.nome, ' ', u.cognome) AS operatore, u.ruolo AS ruolo_operatore
       FROM storico_stato ss
       JOIN stato_segnalazione st ON st.id_stato = ss.id_stato
       LEFT JOIN utente u ON u.id_utente = ss.id_utente_operatore
      WHERE ss.id_segnalazione = ?
      ORDER BY ss.data_cambio, ss.id_storico`,
    [id],
  );
  return righe;
}

// ---- Classifica e statistiche (viste della migrazione 004)

export async function classifica({ quartiere, categoria, limite }, db = pool) {
  const where = ["v.codice_stato <> 'CHIUSA'"];
  const params = [];
  if (quartiere) {
    where.push('v.id_quartiere = ?');
    params.push(quartiere);
  }
  if (categoria) {
    where.push('EXISTS (SELECT 1 FROM segnalazione_categoria sc WHERE sc.id_segnalazione = v.id_segnalazione AND sc.id_categoria = ?)');
    params.push(categoria);
  }
  const [righe] = await db.execute(
    `SELECT v.* FROM v_classifica_segnalazioni v
      WHERE ${where.join(' AND ')}
      ORDER BY v.numero_sostegni DESC, v.data_inserimento ASC
      LIMIT ?`,
    [...params, String(limite)],
  );
  return righe;
}

export async function statistichePubbliche(db = pool) {
  const [[totali]] = await db.execute(
    `SELECT COUNT(*) AS segnalazioni_pubblicate,
            COALESCE(SUM(numero_sostegni), 0) AS sostegni_totali,
            COUNT(DISTINCT id_quartiere) AS quartieri_coinvolti
       FROM v_segnalazioni_pubbliche`,
  );
  const [perStato] = await db.execute(
    `SELECT st.codice, st.nome, COUNT(v.id_segnalazione) AS totale
       FROM stato_segnalazione st LEFT JOIN v_segnalazioni_pubbliche v ON v.id_stato = st.id_stato
      WHERE st.pubblica = TRUE GROUP BY st.id_stato, st.codice, st.nome, st.ordine ORDER BY st.ordine`,
  );
  const [perCategoria] = await db.execute(
    `SELECT c.id_categoria, c.nome, COUNT(v.id_segnalazione) AS totale
       FROM categoria c
       LEFT JOIN segnalazione_categoria sc ON sc.id_categoria = c.id_categoria
       LEFT JOIN v_segnalazioni_pubbliche v ON v.id_segnalazione = sc.id_segnalazione
      GROUP BY c.id_categoria, c.nome ORDER BY totale DESC, c.nome`,
  );
  return { ...totali, sostegni_totali: Number(totali.sostegni_totali), per_stato: perStato, per_categoria: perCategoria };
}
