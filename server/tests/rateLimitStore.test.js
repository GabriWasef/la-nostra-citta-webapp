import './setup-env.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

const { avvia, chiudi, pool } = await import('./helpers.js');
const { MySqlRateLimitStore, eliminaLimitiScaduti } = await import('../src/config/rateLimitStore.js');

before(async () => {
  await avvia();
});
after(chiudi);

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

describe('Store dei limiti di frequenza su MySQL', () => {
  test('conta le richieste, tiene la stessa scadenza nella finestra e riparte da 1 dopo', async () => {
    const store = new MySqlRateLimitStore(pool, 'prova');
    store.init({ windowMs: 600 });
    const a = await store.increment('ip1');
    const b = await store.increment('ip1');
    const c = await store.increment('ip1');
    assert.deepEqual([a.totalHits, b.totalHits, c.totalHits], [1, 2, 3]);
    assert.equal(a.resetTime.getTime(), c.resetTime.getTime(), 'la scadenza non si sposta a ogni richiesta');
    assert.ok(a.resetTime.getTime() > Date.now() - 1000);

    await attendi(700);
    const dopo = await store.increment('ip1');
    assert.equal(dopo.totalHits, 1, 'finestra scaduta: il conteggio riparte');
    assert.ok(dopo.resetTime.getTime() > a.resetTime.getTime());
  });

  test('chiavi e limitatori indipendenti; decrement e reset', async () => {
    const auth = new MySqlRateLimitStore(pool, 'auth');
    const api = new MySqlRateLimitStore(pool, 'api');
    auth.init({ windowMs: 60_000 });
    api.init({ windowMs: 60_000 });
    await auth.increment('x');
    await auth.increment('x');
    assert.equal((await api.increment('x')).totalHits, 1, 'stesso utente, altro limitatore');
    await auth.decrement('x');
    assert.equal((await auth.increment('x')).totalHits, 2);
    await auth.resetKey('x');
    assert.equal((await auth.increment('x')).totalHits, 1);
    await auth.resetAll();
    const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM limite_richieste WHERE chiave LIKE 'auth:%'");
    assert.equal(n, 0);
  });

  test('richieste simultanee non perdono conteggi', async () => {
    const store = new MySqlRateLimitStore(pool, 'parallelo');
    store.init({ windowMs: 60_000 });
    await Promise.all(Array.from({ length: 25 }, () => store.increment('k')));
    assert.equal((await store.increment('k')).totalHits, 26);
  });

  test('chiavi molto lunghe (IPv6 e simili) accorciate senza errori', async () => {
    const store = new MySqlRateLimitStore(pool, 'lungo');
    store.init({ windowMs: 60_000 });
    assert.equal((await store.increment('2001:db8:'.repeat(60))).totalHits, 1);
  });

  test('pulizia dei contatori scaduti', async () => {
    await pool.query("INSERT INTO limite_richieste (chiave, conteggio, scadenza) VALUES ('scaduto:1', 5, DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE))");
    assert.ok((await eliminaLimitiScaduti(pool)) >= 1);
  });
});
