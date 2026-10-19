// setup-env.js deve essere il primo import: la configurazione viene letta una sola volta.
import './setup-env.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT_DIR } from '../src/config/env.js';
import { assicuraDatabaseDiTest, creaUtente, env, pool } from './helpers.js';
import { eseguiSqlFile, migra } from '../scripts/migrate.js';
import { seedBase } from '../scripts/seed.js';
import { fileMigrazioni, migrazioniInSospeso, verificaVersione } from '../src/config/migrazioni.js';

const silenzioso = () => {};

describe('Versione del server', () => {
  test('accetta MySQL 8.0.19 o superiore', () => {
    for (const v of ['8.0.19', '8.0.46-0ubuntu0.24.04.4', '8.4.3', '9.1.0', '10.0.0']) {
      assert.doesNotThrow(() => verificaVersione(v), v);
    }
  });
  test('rifiuta MariaDB e MySQL troppo vecchi con un messaggio chiaro', () => {
    assert.throws(() => verificaVersione('10.4.32-MariaDB'), /MariaDB.*XAMPP/s);
    assert.throws(() => verificaVersione('8.0.18'), /8\.0\.19/);
    assert.throws(() => verificaVersione('5.7.44-log'), /8\.0\.19/);
  });
});

describe('Migrazione 014 (moderazione IA e quote)', () => {
  before(async () => {
    assicuraDatabaseDiTest();
    await migra({ fresh: true, log: silenzioso });
  });

  test('ai_quota: una riga per provider e giorno, contatori non negativi, upsert atomico', async () => {
    const somma = "INSERT INTO ai_quota (provider, giorno, richieste, token) VALUES ('groq', '2026-10-19', 1, 10) AS n ON DUPLICATE KEY UPDATE richieste = ai_quota.richieste + 1, token = ai_quota.token + n.token";
    await pool.query(somma);
    await pool.query(somma);
    const [[riga]] = await pool.query("SELECT richieste, token FROM ai_quota WHERE provider = 'groq' AND giorno = '2026-10-19'");
    assert.deepEqual([riga.richieste, Number(riga.token)], [2, 20]);
    const err = await pool.query("UPDATE ai_quota SET richieste = -1").then(() => null, (e) => e);
    assert.equal(err?.errno, 3819);
  });

  test('segnalazione.data_conferma_nascondimento: facoltativa', async () => {
    const [[col]] = await pool.query(
      "SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'segnalazione' AND COLUMN_NAME = 'data_conferma_nascondimento'",
    );
    assert.equal(col.IS_NULLABLE, 'YES');
  });
});

describe('Migrazione 013 (IA reale)', () => {
  let idSegnalazione, idAllegato;
  const errore = (sql, params) => pool.query(sql, params).then(() => null, (e) => e);

  before(async () => {
    assicuraDatabaseDiTest();
    await migra({ fresh: true, log: silenzioso });
    await seedBase(silenzioso);
    const autore = await creaUtente();
    [{ insertId: idSegnalazione }] = await pool.query(
      `INSERT INTO segnalazione (titolo, descrizione, id_autore, id_quartiere, id_stato_corrente)
       VALUES ('Titolo valido', 'Descrizione abbastanza lunga per il vincolo', ?, 1, 1)`,
      [autore.id_utente],
    );
    [{ insertId: idAllegato }] = await pool.query(
      "INSERT INTO allegato (nome_file, percorso_file, tipo_mime, tipo_media, dimensione_bytes, id_segnalazione) VALUES ('a.jpg', 'x/a.jpg', 'image/jpeg', 'IMMAGINE', 10, ?)",
      [idSegnalazione],
    );
  });

  test('VERIFICA_AUTENTICITA è un tipo ammesso per analisi e job; i tipi sconosciuti restano vietati', async () => {
    await pool.query(
      "INSERT INTO analisi_ia (tipo_analisi, modello, risultato, esito, id_allegato) VALUES ('VERIFICA_AUTENTICITA', 'm', '{}', 'DA_REVISIONARE', ?)",
      [idAllegato],
    );
    await pool.query(
      "INSERT INTO job_elaborazione (tipo_analisi, id_segnalazione, id_allegato) VALUES ('VERIFICA_AUTENTICITA', ?, ?)",
      [idSegnalazione, idAllegato],
    );
    for (const [sql, params] of [
      ["INSERT INTO analisi_ia (tipo_analisi, modello, risultato, id_segnalazione) VALUES ('VERIFICA_ALTRO', 'm', '{}', ?)", [idSegnalazione]],
      ["INSERT INTO job_elaborazione (tipo_analisi, id_segnalazione) VALUES ('VERIFICA_ALTRO', ?)", [idSegnalazione]],
    ]) {
      assert.equal((await errore(sql, params))?.errno, 3819, sql);
    }
  });

  test('i tipi già esistenti restano ammessi', async () => {
    for (const tipo of ['MODERAZIONE_TESTO', 'CLASSIFICAZIONE_TESTO', 'ANALISI_IMMAGINE', 'ANALISI_VIDEO', 'ESTRAZIONE_EXIF', 'VERIFICA_PERTINENZA']) {
      await pool.query('INSERT INTO job_elaborazione (tipo_analisi, id_segnalazione) VALUES (?, ?)', [tipo, idSegnalazione]);
      await pool.query("INSERT INTO analisi_ia (tipo_analisi, modello, risultato, id_segnalazione) VALUES (?, 'm', '{}', ?)", [tipo, idSegnalazione]);
    }
  });

  test('job rimandabili: disponibile_dal è facoltativo', async () => {
    await pool.query(
      "INSERT INTO job_elaborazione (tipo_analisi, id_segnalazione, disponibile_dal) VALUES ('MODERAZIONE_TESTO', ?, CURRENT_TIMESTAMP + INTERVAL 1 MINUTE)",
      [idSegnalazione],
    );
    const [[job]] = await pool.query('SELECT disponibile_dal FROM job_elaborazione ORDER BY id_job DESC LIMIT 1');
    assert.ok(job.disponibile_dal instanceof Date);
  });

  test('allegato: hash percettivo di 16 cifre esadecimali minuscole, indicizzato; data di scatto', async () => {
    await pool.query("UPDATE allegato SET hash_percettivo = '0f1e2d3c4b5a6978', data_scatto_exif = '2026-05-01 10:30:00' WHERE id_allegato = ?", [idAllegato]);
    for (const valore of ['0F1E2D3C4B5A6978', 'zz1e2d3c4b5a6978', '0f1e2d3c4b5a69']) {
      const err = await errore('UPDATE allegato SET hash_percettivo = ? WHERE id_allegato = ?', [valore, idAllegato]);
      assert.equal(err?.errno, 3819, valore);
    }
    const [indici] = await pool.query(
      "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'allegato' AND COLUMN_NAME = 'hash_percettivo'",
    );
    assert.ok(indici.length > 0);
  });
});

describe('Migrazioni', () => {
  before(() => {
    assicuraDatabaseDiTest();
    return migra({ fresh: true, log: silenzioso });
  });
  after(async () => {
    await pool.end().catch(() => {});
  });

  test('database vuoto: tutte le migrazioni risultano da applicare', async () => {
    await migra({ fresh: true, log: silenzioso });
    await pool.query('DROP TABLE schema_migrazioni');
    assert.equal((await migrazioniInSospeso(pool)).length, (await fileMigrazioni()).length);
  });

  test('database creato con lo script ufficiale: la 001 viene riconosciuta e si applicano le correzioni', async () => {
    await migra({ fresh: true, log: silenzioso });
    // Riparte da un database con il solo script ufficiale, come se fosse stato eseguito a mano.
    const conn = pool;
    const [oggetti] = await conn.query(
      'SELECT TABLE_NAME AS n, TABLE_TYPE AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
      [env.DB_NAME],
    );
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const { n, t } of oggetti) await conn.query(`DROP ${t === 'VIEW' ? 'VIEW' : 'TABLE'} \`${n}\``);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    const c = await conn.getConnection();
    try {
      await eseguiSqlFile(c, path.join(ROOT_DIR, 'database/schema/database_la_nostra_citta_mysql.sql'));
    } finally {
      c.release();
    }

    const messaggi = [];
    await migra({ log: (m) => messaggi.push(m) });
    assert.ok(messaggi.some((m) => /script ufficiale/.test(m)));
    assert.deepEqual(await migrazioniInSospeso(pool), []);
    const [[stato]] = await pool.query("SELECT codice, pubblica FROM stato_segnalazione WHERE nome = 'Approvata'");
    assert.equal(stato.codice, 'APPROVATA');
  });
});

