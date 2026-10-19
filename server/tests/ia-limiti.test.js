// Limiti verso i provider: AI_MAX_RPM sulla tabella limite_richieste, AI_MAX_RPD e AI_MAX_TPD sulla tabella ai_quota.
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { avvia, chiudi, pool } from './helpers.js';
import { RinvioJob } from '../src/ai/errori.js';
import { creaLlmDaConfig } from '../src/ai/providers/index.js';
import { creaLimitatore, creaLimitatori } from '../src/ai/providers/limiti.js';
import { eliminaLimitiScaduti } from '../src/config/rateLimitStore.js';
import { creaFetchFinto, errore, json, RISPOSTA_TESTO } from './mistral-finto.js';

// 14/10/2026 10:20:30 UTC
const ORA = Date.UTC(2026, 9, 14, 10, 20, 30);
const orologio = (inizio = ORA) => {
  let t = inizio;
  const ora = () => t;
  ora.avanza = (ms) => {
    t += ms;
  };
  return ora;
};
const prenotazioni = async (limitatore, n) => {
  const esiti = [];
  for (let i = 0; i < n; i++) esiti.push(await limitatore.prenota());
  return esiti;
};
const quota = async (provider) =>
  Object.fromEntries(
    (await pool.query("SELECT DATE_FORMAT(giorno, '%Y-%m-%d') AS giorno, richieste, token FROM ai_quota WHERE provider = ? ORDER BY giorno", [provider]))[0]
      .map((r) => [r.giorno, { richieste: r.richieste, token: Number(r.token) }]),
  );
const contatori = async (prefisso) =>
  Object.fromEntries((await pool.query('SELECT chiave, conteggio FROM limite_richieste WHERE chiave LIKE ? ORDER BY chiave', [`${prefisso}%`]))[0].map((r) => [r.chiave, r.conteggio]));

before(() => avvia());
beforeEach(async () => {
  await pool.query("DELETE FROM limite_richieste WHERE chiave LIKE 'ai:%'");
  await pool.query('DELETE FROM ai_quota');
});
after(() => chiudi());

describe('Limitatore delle richieste ai provider', () => {
  test('sotto RPM: tutte accettate; sopra: rifiutata con il tempo fino al minuto successivo', async () => {
    const l = creaLimitatore({ pool, nome: 'mistral', rpm: 3, rpd: 100, ora: orologio() });
    const esiti = await prenotazioni(l, 4);
    assert.deepEqual(esiti.slice(0, 3).map((e) => e.ok), [true, true, true]);
    assert.deepEqual(esiti[3], { ok: false, limite: 'RPM', ritardoMs: 30_000 });
  });

  test('minuto in limite_richieste (ai:<provider>:min:<minuto>), giorno in ai_quota; le rifiutate non contano', async () => {
    const l = creaLimitatore({ pool, nome: 'mistral', rpm: 2, rpd: 100, ora: orologio() });
    await prenotazioni(l, 5);
    assert.deepEqual(await contatori('ai:mistral'), { [`ai:mistral:min:${Math.floor(ORA / 60_000)}`]: 2 });
    assert.deepEqual(await quota('mistral'), { '2026-10-14': { richieste: 2, token: 0 } });
  });

  test('ai_quota: aggiornamento atomico, anche con molte prenotazioni in parallelo', async () => {
    const l = creaLimitatore({ pool, nome: 'cloudflare', rpm: 0, rpd: 0, ora: orologio() });
    await Promise.all([...Array(20)].map(() => l.prenota()));
    await Promise.all([...Array(5)].map(() => l.registraToken(100, '2026-10-14')));
    assert.deepEqual(await quota('cloudflare'), { '2026-10-14': { richieste: 20, token: 500 } });
  });

  test('limite giornaliero di token (TPD): raggiunto il totale, rifiutata fino a mezzanotte UTC', async () => {
    const ora = orologio();
    const l = creaLimitatore({ pool, nome: 'cloudflare', rpm: 0, rpd: 0, tpd: 1000, ora });
    const { giorno } = await l.prenota();
    await l.registraToken(1000, giorno);
    const rifiutata = await l.prenota();
    assert.deepEqual([rifiutata.ok, rifiutata.limite, rifiutata.ritardoMs], [false, 'TPD', Date.UTC(2026, 9, 15) - ORA]);
    assert.equal((await quota('cloudflare'))['2026-10-14'].richieste, 1, 'la richiesta rifiutata non conta');
    ora.avanza(24 * 60 * 60_000);
    assert.equal((await l.prenota()).ok, true);
  });

  test('nuovo minuto: si riparte', async () => {
    const ora = orologio();
    const l = creaLimitatore({ pool, nome: 'mistral', rpm: 1, rpd: 100, ora });
    assert.equal((await l.prenota()).ok, true);
    assert.equal((await l.prenota()).ok, false);
    ora.avanza(60_000);
    assert.equal((await l.prenota()).ok, true);
  });

  test('sopra RPD: rifiutata fino a mezzanotte UTC, anche in minuti diversi; il giorno dopo si riparte', async () => {
    const ora = orologio();
    const l = creaLimitatore({ pool, nome: 'groq', rpm: 10, rpd: 2, ora });
    assert.deepEqual((await prenotazioni(l, 2)).map((e) => e.ok), [true, true]);
    ora.avanza(5 * 60_000);
    const rifiutata = await l.prenota();
    assert.equal(rifiutata.ok, false);
    assert.equal(rifiutata.limite, 'RPD');
    assert.equal(rifiutata.ritardoMs, Date.UTC(2026, 9, 15) - (ORA + 5 * 60_000));
    // Il rifiuto per RPD non consuma il minuto.
    assert.equal((await contatori('ai:groq:min'))[`ai:groq:min:${Math.floor((ORA + 5 * 60_000) / 60_000)}`], 0);
    ora.avanza(24 * 60 * 60_000);
    assert.equal((await l.prenota()).ok, true);
  });

  test('provider indipendenti; 0 = nessun limite', async () => {
    const ora = orologio();
    const mistral = creaLimitatore({ pool, nome: 'mistral', rpm: 1, rpd: 1, ora });
    const groq = creaLimitatore({ pool, nome: 'groq', rpm: 0, rpd: 0, ora });
    assert.equal((await mistral.prenota()).ok, true);
    assert.equal((await mistral.prenota()).ok, false);
    assert.ok((await prenotazioni(groq, 20)).every((e) => e.ok));
  });

  test('istanze diverse condividono i contatori (come più funzioni su Vercel)', async () => {
    const ora = orologio();
    const a = creaLimitatore({ pool, nome: 'mistral', rpm: 4, rpd: 100, ora });
    const b = creaLimitatore({ pool, nome: 'mistral', rpm: 4, rpd: 100, ora });
    // In concorrenza il conteggio è prudente (può rifiutare qualcuna in più), ma non supera mai il limite.
    const esiti = await Promise.all([...Array(4)].flatMap(() => [a.prenota(), b.prenota()]));
    const accettate = esiti.filter((e) => e.ok).length;
    assert.ok(accettate >= 1 && accettate <= 4, String(accettate));
    assert.equal(Object.values(await contatori('ai:mistral:min'))[0], accettate);
    // Completando in sequenza si arriva esattamente al limite condiviso.
    const seguenti = await prenotazioni(b, 6);
    assert.equal(accettate + seguenti.filter((e) => e.ok).length, 4);
  });

  test('valori per provider oppure comuni', () => {
    const l = creaLimitatori({ AI_MAX_RPM: 20, AI_MAX_RPD: 500, AI_MAX_TPD: 1000, GROQ_MAX_RPM: 30 }, pool);
    assert.deepEqual(Object.keys(l), ['mistral', 'cloudflare', 'groq']);
  });

  test('la manutenzione elimina i contatori scaduti', async () => {
    await creaLimitatore({ pool, nome: 'mistral', rpm: 5, rpd: 5 }).prenota();
    await pool.query("UPDATE limite_richieste SET scadenza = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND WHERE chiave LIKE 'ai:mistral:min:%'");
    assert.ok((await eliminaLimitiScaduti(pool)) >= 1);
    assert.deepEqual(Object.keys(await contatori('ai:mistral:min')), []);
  });
});

describe('Limiti nel modello linguistico', () => {
  const cfg = (extra = {}) => ({
    AI_PROVIDER: 'mistral', AI_FALLBACK_PROVIDER: 'regole', MISTRAL_API_KEY: 'k', MISTRAL_MODEL: 'mistral-small-latest',
    GROQ_API_KEY: 'g', GROQ_MODEL: 'qwen/qwen3.8-27b', AI_TIMEOUT_MS: 1000, AI_MAX_RETRIES: 0, ...extra,
  });
  const dati = { testo: 'Buca in via Padova', categorie: ['Manutenzione stradale'] };

  test('limite raggiunto senza fallback: nessuna chiamata, il job si rimanda (non è un errore)', async () => {
    const fetch = creaFetchFinto([json(RISPOSTA_TESTO)]);
    const llm = creaLlmDaConfig(cfg(), { fetch, limitatori: { mistral: creaLimitatore({ pool, nome: 'mistral', rpm: 1, rpd: 100 }) } });
    await llm.analizzaTesto(dati);
    const err = await llm.analizzaTesto(dati).then(() => null, (e) => e);
    assert.ok(err instanceof RinvioJob, String(err));
    assert.ok(err.ritardoMs > 0 && err.ritardoMs <= 60_000);
    assert.equal(fetch.chiamate.length, 1);
  });

  test('limite di Mistral raggiunto: si passa a Groq', async () => {
    const fetch = creaFetchFinto([json(RISPOSTA_TESTO)]);
    const llm = creaLlmDaConfig(cfg({ AI_FALLBACK_PROVIDER: 'groq' }), {
      fetch,
      limitatori: {
        mistral: creaLimitatore({ pool, nome: 'mistral', rpm: 0, rpd: 1 }),
        groq: creaLimitatore({ pool, nome: 'groq', rpm: 10, rpd: 10 }),
      },
    });
    assert.equal((await llm.analizzaTesto(dati)).modello, 'mistral:mistral-small-latest');
    assert.equal((await llm.analizzaTesto(dati)).modello, 'groq:qwen/qwen3.8-27b');
  });

  test('rispetto del limite giornaliero: superata la quota di Cloudflare le richieste successive vanno a Groq, poi si rimandano', async () => {
    const fetch = creaFetchFinto([json(RISPOSTA_TESTO, { token: 700 })]);
    const llm = creaLlmDaConfig(cfg({ AI_PROVIDER: 'cloudflare', AI_FALLBACK_PROVIDER: 'groq', CLOUDFLARE_ACCOUNT_ID: 'abc', CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_MODEL: '@cf/google/gemma-4-26b-a4b-it' }), {
      fetch,
      limitatori: {
        cloudflare: creaLimitatore({ pool, nome: 'cloudflare', rpm: 0, rpd: 2, tpd: 0 }),
        groq: creaLimitatore({ pool, nome: 'groq', rpm: 0, rpd: 1, tpd: 0 }),
      },
    });
    const modelli = [];
    for (let i = 0; i < 3; i++) modelli.push((await llm.analizzaTesto(dati)).modello);
    assert.deepEqual(modelli, ['cloudflare:@cf/google/gemma-4-26b-a4b-it', 'cloudflare:@cf/google/gemma-4-26b-a4b-it', 'groq:qwen/qwen3.8-27b']);
    // Tutti i livelli esterni al limite: il job si rimanda (restano le analisi a regole), nessuna chiamata.
    const err = await llm.analizzaTesto(dati).then(() => null, (e) => e);
    assert.ok(err instanceof RinvioJob, String(err));
    assert.equal(fetch.chiamate.length, 3);
    const giorno = new Date().toISOString().slice(0, 10);
    assert.deepEqual((await quota('cloudflare'))[giorno], { richieste: 2, token: 1400 });
    assert.deepEqual((await quota('groq'))[giorno], { richieste: 1, token: 700 });
  });

  test('i nuovi tentativi contano nel limite', async () => {
    const fetch = creaFetchFinto([errore(503), json(RISPOSTA_TESTO)]);
    const llm = creaLlmDaConfig(cfg({ AI_MAX_RETRIES: 2 }), {
      fetch,
      attendi: async () => {},
      limitatori: { mistral: creaLimitatore({ pool, nome: 'mistral', rpm: 5, rpd: 100 }) },
    });
    await llm.analizzaTesto(dati);
    assert.equal(Object.values(await contatori('ai:mistral:min'))[0], 2);
  });
});
