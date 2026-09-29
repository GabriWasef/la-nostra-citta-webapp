// Vincoli e trigger verificati direttamente sul database MySQL.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { avvia, chiudi, creaUtente, pool } from './helpers.js';
import { splitSqlStatements } from '../src/utils/sqlSplitter.js';

let autore, altro, idInserita, idApprovata;

async function nuovaSegnalazione(stato = 'INSERITA') {
  const [r] = await pool.query(
    `INSERT INTO segnalazione (titolo, descrizione, id_autore, id_quartiere, id_stato_corrente)
     VALUES ('Titolo valido', 'Descrizione abbastanza lunga per il vincolo', ?, 1, (SELECT id_stato FROM stato_segnalazione WHERE codice = ?))`,
    [autore.id_utente, stato],
  );
  return r.insertId;
}

before(async () => {
  await avvia();
  autore = await creaUtente();
  altro = await creaUtente();
  idInserita = await nuovaSegnalazione();
  idApprovata = await nuovaSegnalazione();
  await pool.query(
    "INSERT INTO allegato (nome_file, percorso_file, tipo_mime, tipo_media, dimensione_bytes, id_segnalazione) VALUES ('a.jpg', '2026/01/00000000-0000-0000-0000-000000000001.jpg', 'image/jpeg', 'IMMAGINE', 10, ?)",
    [idApprovata],
  );
  await pool.query('INSERT INTO segnalazione_categoria (id_segnalazione, id_categoria) VALUES (?, 1)', [idApprovata]);
  await pool.query("UPDATE segnalazione SET id_stato_corrente = (SELECT id_stato FROM stato_segnalazione WHERE codice = 'APPROVATA') WHERE id_segnalazione = ?", [idApprovata]);
});
after(chiudi);

const errore = async (sql, params = []) => {
  try {
    await pool.query(sql, params);
  } catch (err) {
    return err;
  }
  assert.fail(`Doveva fallire: ${sql}`);
};

describe('Trigger di integrità', () => {
  test('una segnalazione non può nascere già pubblicata (P1)', async () => {
    const err = await errore(
      `INSERT INTO segnalazione (titolo, descrizione, id_autore, id_quartiere, id_stato_corrente)
       VALUES ('Titolo valido', 'Descrizione abbastanza lunga per il vincolo', ?, 1, (SELECT id_stato FROM stato_segnalazione WHERE codice = 'APPROVATA'))`,
      [autore.id_utente],
    );
    assert.equal(err.errno, 1644);
  });

  test('pubblicazione senza allegato bloccata', async () => {
    const err = await errore("UPDATE segnalazione SET id_stato_corrente = (SELECT id_stato FROM stato_segnalazione WHERE codice = 'APPROVATA') WHERE id_segnalazione = ?", [idInserita]);
    assert.match(err.sqlMessage, /allegato/);
  });

  test('ultimo allegato e ultima categoria di una segnalazione pubblicata non eliminabili (P2)', async () => {
    assert.equal((await errore('DELETE FROM allegato WHERE id_segnalazione = ?', [idApprovata])).errno, 1644);
    assert.equal((await errore('DELETE FROM segnalazione_categoria WHERE id_segnalazione = ?', [idApprovata])).errno, 1644);
  });

  test('eliminando la segnalazione, allegati e categorie vanno in cascata', async () => {
    const id = await nuovaSegnalazione();
    await pool.query('INSERT INTO segnalazione_categoria (id_segnalazione, id_categoria) VALUES (?, 2)', [id]);
    await pool.query('DELETE FROM segnalazione WHERE id_segnalazione = ?', [id]);
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM segnalazione_categoria WHERE id_segnalazione = ?', [id]);
    assert.equal(n, 0);
  });

  test('sostegno: duplicato, autosostegno e segnalazione non pubblicata (P3)', async () => {
    await pool.query('INSERT INTO sostegno (id_utente, id_segnalazione) VALUES (?, ?)', [altro.id_utente, idApprovata]);
    assert.equal((await errore('INSERT INTO sostegno (id_utente, id_segnalazione) VALUES (?, ?)', [altro.id_utente, idApprovata])).errno, 1062);
    assert.match((await errore('INSERT INTO sostegno (id_utente, id_segnalazione) VALUES (?, ?)', [autore.id_utente, idApprovata])).sqlMessage, /tua segnalazione/);
    assert.match((await errore('INSERT INTO sostegno (id_utente, id_segnalazione) VALUES (?, ?)', [altro.id_utente, idInserita])).sqlMessage, /pubblicate/);
  });

  test('autore con account non attivo non può inserire', async () => {
    const sospeso = await creaUtente();
    await pool.query("UPDATE utente SET stato_account = 'SOSPESO' WHERE id_utente = ?", [sospeso.id_utente]);
    const err = await errore(
      "INSERT INTO segnalazione (titolo, descrizione, id_autore, id_quartiere, id_stato_corrente) VALUES ('Titolo valido', 'Descrizione abbastanza lunga per il vincolo', ?, 1, 1)",
      [sospeso.id_utente],
    );
    assert.match(err.sqlMessage, /ATTIVO/);
  });

  test('le viste pubbliche escludono segnalazioni non pubblicate (P4)', async () => {
    const [righe] = await pool.query('SELECT id_segnalazione, numero_sostegni FROM v_classifica_segnalazioni');
    assert.deepEqual(righe.map((r) => r.id_segnalazione), [idApprovata]);
    assert.equal(righe[0].numero_sostegni, 1);
  });
});

describe('Vincoli CHECK', () => {
  test('domini di titolo, coordinate, ruolo, tipo media, punteggio IA', async () => {
    const casi = [
      ["UPDATE segnalazione SET titolo = 'Ab' WHERE id_segnalazione = ?", [idInserita]],
      ['UPDATE segnalazione SET latitudine = 95, longitudine = 9, origine_coordinate = ? WHERE id_segnalazione = ?', ['UTENTE', idInserita]],
      ['UPDATE segnalazione SET latitudine = 45, longitudine = NULL WHERE id_segnalazione = ?', [idInserita]],
      ["UPDATE utente SET ruolo = 'SUPERUSER' WHERE id_utente = ?", [altro.id_utente]],
      ["INSERT INTO allegato (nome_file, percorso_file, tipo_mime, tipo_media, dimensione_bytes, id_segnalazione) VALUES ('v.mp4', 'x/v.mp4', 'video/mp4', 'IMMAGINE', 5, ?)", [idInserita]],
      ["INSERT INTO allegato (nome_file, percorso_file, tipo_mime, tipo_media, dimensione_bytes, id_segnalazione) VALUES ('v.jpg', 'x/w.jpg', 'image/jpeg', 'IMMAGINE', 0, ?)", [idInserita]],
      ["INSERT INTO analisi_ia (tipo_analisi, modello, risultato, punteggio, id_segnalazione) VALUES ('MODERAZIONE_TESTO', 'm', '{}', 1.5, ?)", [idInserita]],
      ["INSERT INTO analisi_ia (tipo_analisi, modello, risultato) VALUES ('MODERAZIONE_TESTO', 'm', '{}')", []],
    ];
    for (const [sql, params] of casi) {
      const err = await errore(sql, params);
      assert.equal(err.errno, 3819, `${sql} → ${err.message}`);
    }
  });
});

describe('Divisione degli script SQL', () => {
  test('gestisce DELIMITER, stringhe e commenti', () => {
    const sql = `-- commento; con punto e virgola
CREATE TABLE t (a VARCHAR(10) DEFAULT 'x;y');
DELIMITER $$
CREATE TRIGGER tr BEFORE INSERT ON t FOR EACH ROW
BEGIN
  SET NEW.a = 'l''ok;';
END$$
DELIMITER ;
SELECT 1;`;
    const parti = splitSqlStatements(sql);
    assert.equal(parti.length, 3);
    assert.match(parti[1], /^CREATE TRIGGER[\s\S]*END$/);
    assert.match(parti[0], /'x;y'/);
  });
});
