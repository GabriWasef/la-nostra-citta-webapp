// setup-env.js deve essere il primo import: la configurazione viene letta una sola volta.
import './setup-env.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT_DIR } from '../src/config/env.js';
import { assicuraDatabaseDiTest, env, pool } from './helpers.js';
import { eseguiSqlFile, migra } from '../scripts/migrate.js';
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

