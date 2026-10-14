// Worker della coda job_elaborazione con un modello linguistico finto (nessuna rete).
import { after, afterEach, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { accedi, avvia, chiudi, creaUtente, inviaSegnalazione, pool } from './helpers.js';
import { RinvioJob } from '../src/ai/errori.js';
import { creaLlmDaConfig } from '../src/ai/providers/index.js';
import { creaFetchFinto, json, rete, RISPOSTA_PERTINENZA, RISPOSTA_TESTO } from './mistral-finto.js';
import { provider } from '../src/ai/index.js';
import { elaboraTutti, riprendiJobBloccati, TENTATIVI_MASSIMI } from '../src/ai/worker.js';
import { eseguiManutenzione } from '../src/services/manutenzione.service.js';

let autore, agAutore;
const chiamate = [];
let comportamento = 'ok';

const rispostaTesto = {
  testo: { accettabile: true, gravita: 'nessuna', motivi: [] },
  categorie_suggerite: [
    { nome: 'Manutenzione stradale', confidenza: 0.9 },
    { nome: 'Categoria inventata', confidenza: 0.8 },
  ],
  esito_suggerito: 'OK',
  spiegazione: 'Segnalazione civile di una buca.',
};
const rispostaPertinenza = {
  testo: { accettabile: true, gravita: 'nessuna', motivi: [] },
  immagine: {
    corrisponde_al_testo: false,
    corrisponde_alla_categoria: false,
    categoria_suggerita: 'Verde pubblico',
    inappropriata: false,
    confidenza: 0.85,
    osservato: 'Un prato',
  },
  segnale_autenticita: { sembra_generata_o_montata: false, confidenza: 0.1 },
  esito_suggerito: 'DA_REVISIONARE',
  spiegazione: 'La foto mostra un prato, non una buca.',
};

function risposta(tipo, dati, risp) {
  chiamate.push({ tipo, dati });
  if (comportamento === 'errore') throw Object.assign(new Error('Servizio non raggiungibile'), { modello: 'finto:modello' });
  if (comportamento === 'rinvio') throw new RinvioJob('Limite di richieste raggiunto', 30_000);
  return { modello: 'finto:modello', risposta: risp };
}

const llmFinto = {
  analizzaTesto: async (dati) => risposta('testo', dati, rispostaTesto),
  verificaPertinenza: async (dati) => risposta('pertinenza', dati, rispostaPertinenza),
};

const jobDi = async (id) => (await pool.query('SELECT * FROM job_elaborazione WHERE id_segnalazione = ? ORDER BY id_job', [id]))[0];
const analisiDi = async (id) =>
  (await pool.query(
    `SELECT ai.* FROM analisi_ia ai LEFT JOIN allegato a ON a.id_allegato = ai.id_allegato
      WHERE ai.id_segnalazione = ? OR a.id_segnalazione = ? ORDER BY ai.id_analisi`,
    [id, id],
  ))[0];
/** Simula il passare del tempo: i job rimandati tornano disponibili. */
const rendiDisponibili = () => pool.query('UPDATE job_elaborazione SET disponibile_dal = NULL');
const svuota = async () => {
  let n = 0;
  for (let k; (k = await elaboraTutti({ massimo: 50 })) > 0; ) n += k;
  return n;
};

async function nuovaSegnalazione(dati = {}) {
  const res = await inviaSegnalazione(agAutore, { categorie: [await idCategoria('Manutenzione stradale')], ...dati });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.segnalazione.id_segnalazione;
}
const idCategoria = async (nome) => (await pool.query('SELECT id_categoria FROM categoria WHERE nome = ?', [nome]))[0][0].id_categoria;

before(async () => {
  await avvia();
  autore = await creaUtente('CITTADINO', { email: 'autore.privacy@test.it' });
  agAutore = await accedi(autore);
  provider.llm = llmFinto;
});
afterEach(async () => {
  comportamento = 'ok';
  // Coda pulita per il test successivo, compresi i job rimandati.
  await rendiDisponibili();
  await svuota();
  chiamate.length = 0;
});
after(async () => {
  provider.llm = null;
  await chiudi();
});

describe('Creazione con un modello linguistico configurato', () => {
  test('nessuna chiamata al modello nella richiesta, anche se il provider è giù; i job sono in coda', async () => {
    comportamento = 'errore';
    const id = await nuovaSegnalazione();
    assert.equal(chiamate.length, 0);
    const tipi = (await jobDi(id)).map((j) => j.tipo_analisi).sort();
    assert.deepEqual(tipi, ['ANALISI_IMMAGINE', 'MODERAZIONE_TESTO', 'VERIFICA_PERTINENZA']);
    // Il filtro a regole resta nella richiesta.
    const [regole] = await analisiDi(id);
    assert.equal(regole.modello, 'regole-moderazione-it@1');
  });

  test('il filtro a regole blocca ancora nella richiesta (422) senza interpellare il modello', async () => {
    const res = await inviaSegnalazione(agAutore, { descrizione: 'Se trovo chi ha fatto questa buca lo ammazzo, giuro.' });
    assert.equal(res.status, 422);
    assert.equal(chiamate.length, 0);
  });
});

describe('Esecutori del worker', () => {
  test('MODERAZIONE_TESTO: una chiamata, due righe (moderazione e classificazione); le categorie non si toccano', async () => {
    const id = await nuovaSegnalazione();
    const prima = (await pool.query('SELECT id_categoria, origine_assegnazione FROM segnalazione_categoria WHERE id_segnalazione = ?', [id]))[0];
    await svuota();

    assert.equal(chiamate.filter((c) => c.tipo === 'testo').length, 1);
    const analisi = await analisiDi(id);
    const moderazioni = analisi.filter((a) => a.tipo_analisi === 'MODERAZIONE_TESTO');
    // Restano entrambe: quella a regole (nella richiesta) e quella del modello, distinte dal campo modello.
    assert.deepEqual(moderazioni.map((a) => a.modello), ['regole-moderazione-it@1', 'finto:modello']);
    assert.equal(moderazioni[1].esito, 'OK');

    const classificazione = analisi.find((a) => a.tipo_analisi === 'CLASSIFICAZIONE_TESTO' && a.modello === 'finto:modello');
    assert.deepEqual(classificazione.risultato.suggerite.map((c) => c.nome), ['Manutenzione stradale']); // l'inventata è scartata
    assert.equal(classificazione.esito, 'OK');
    const dopo = (await pool.query('SELECT id_categoria, origine_assegnazione FROM segnalazione_categoria WHERE id_segnalazione = ?', [id]))[0];
    assert.deepEqual(dopo, prima);
  });

  test('VERIFICA_PERTINENZA: un’analisi per immagine, collegata all’allegato', async () => {
    const id = await nuovaSegnalazione();
    await svuota();
    const [allegato] = (await pool.query('SELECT id_allegato FROM allegato WHERE id_segnalazione = ?', [id]))[0];
    const [p] = (await analisiDi(id)).filter((a) => a.tipo_analisi === 'VERIFICA_PERTINENZA');
    assert.equal(p.id_allegato, allegato.id_allegato);
    assert.equal(p.modello, 'finto:modello');
    assert.equal(p.esito, 'DA_REVISIONARE');
    assert.deepEqual(p.risultato.motivi_esito, ['IMMAGINE_NON_CORRISPONDE_AL_TESTO', 'IMMAGINE_NON_CORRISPONDE_ALLA_CATEGORIA']);
    assert.equal(Number(p.punteggio), 0.85);
  });

  test('CLASSIFICAZIONE_TESTO accodata da sola: solo la riga di classificazione', async () => {
    const id = await nuovaSegnalazione();
    await svuota();
    await pool.query("INSERT INTO job_elaborazione (tipo_analisi, id_segnalazione) VALUES ('CLASSIFICAZIONE_TESTO', ?)", [id]);
    const prima = (await analisiDi(id)).length;
    await svuota();
    const nuove = (await analisiDi(id)).slice(prima);
    assert.deepEqual(nuove.map((a) => a.tipo_analisi), ['CLASSIFICAZIONE_TESTO']);
  });

  test('privacy: al modello vanno solo testo, categorie e immagine, mai i dati dell’autore', async () => {
    await nuovaSegnalazione();
    await svuota();
    assert.ok(chiamate.length >= 2);
    for (const { dati } of chiamate) {
      assert.deepEqual(Object.keys(dati).filter((k) => !['testo', 'categorie', 'categorie_dichiarate', 'immagine'].includes(k)), []);
      const serializzato = JSON.stringify({ ...dati, immagine: undefined });
      for (const v of [autore.email, autore.cognome, `"${autore.id_utente}"`]) assert.ok(!serializzato.includes(v), v);
    }
  });
});

describe('Tentativi, rinvii e limiti', () => {
  test('job fallito: torna in coda (con attesa) fino a 3 tentativi, poi ERRORE e analisi da revisionare', async () => {
    const id = await nuovaSegnalazione();
    comportamento = 'errore';
    const moderazione = async () => (await jobDi(id)).find((j) => j.tipo_analisi === 'MODERAZIONE_TESTO');

    for (let tentativo = 1; tentativo < TENTATIVI_MASSIMI; tentativo++) {
      await svuota();
      const job = await moderazione();
      assert.deepEqual([job.stato, job.tentativi], ['IN_CODA', tentativo]);
      assert.ok(job.disponibile_dal > new Date(Date.now() - 5000), 'attesa prima del nuovo tentativo');
      assert.equal(await elaboraTutti(), 0, 'non si riprova prima dell’attesa');
      await rendiDisponibili();
    }
    await svuota();
    const job = await moderazione();
    assert.deepEqual([job.stato, job.tentativi], ['ERRORE', TENTATIVI_MASSIMI]);
    assert.match(job.ultimo_errore, /non raggiungibile/);

    const nonRiuscita = (await analisiDi(id)).find((a) => a.tipo_analisi === 'MODERAZIONE_TESTO' && a.modello === 'finto:modello');
    assert.equal(nonRiuscita.esito, 'DA_REVISIONARE');
    assert.equal(nonRiuscita.risultato.errore, 'PROVIDER_NON_DISPONIBILE');
  });

  test('limite del provider: il job è rimandato senza consumare tentativi', async () => {
    const id = await nuovaSegnalazione();
    comportamento = 'rinvio';
    await svuota();
    const job = (await jobDi(id)).find((j) => j.tipo_analisi === 'MODERAZIONE_TESTO');
    assert.deepEqual([job.stato, job.tentativi], ['IN_CODA', 0]);
    assert.ok(job.disponibile_dal > new Date(), 'disponibile più tardi');
    assert.match(job.ultimo_errore, /Limite/);
    comportamento = 'ok';
    await rendiDisponibili();
    await svuota();
    assert.equal((await jobDi(id)).find((j) => j.tipo_analisi === 'MODERAZIONE_TESTO').stato, 'COMPLETATO');
  });

  test('i job COMPLETATI non vengono rielaborati', async () => {
    const id = await nuovaSegnalazione();
    await svuota();
    const n = chiamate.length;
    const righe = (await analisiDi(id)).length;
    assert.equal(await elaboraTutti(), 0);
    assert.equal(chiamate.length, n);
    assert.equal((await analisiDi(id)).length, righe);
  });

  test('al massimo N job per invocazione e nessuno se il tempo residuo è inferiore al margine', async () => {
    await nuovaSegnalazione();
    await nuovaSegnalazione();
    assert.equal(await elaboraTutti({ massimo: 2 }), 2);
    assert.equal(await elaboraTutti({ massimo: 10, scadenza: Date.now() + 5_000 }), 0);
    assert.ok((await elaboraTutti({ massimo: 10 })) > 0);
  });

  test('job bloccato IN_CORSO: ripreso dalla manutenzione (o in ERRORE se ha finito i tentativi)', async () => {
    const id = await nuovaSegnalazione();
    const [primo, secondo] = await jobDi(id);
    await pool.query(
      "UPDATE job_elaborazione SET stato = 'IN_CORSO', tentativi = 1, data_aggiornamento = CURRENT_TIMESTAMP - INTERVAL 11 MINUTE WHERE id_job = ?",
      [primo.id_job],
    );
    await pool.query(
      "UPDATE job_elaborazione SET stato = 'IN_CORSO', tentativi = ?, data_aggiornamento = CURRENT_TIMESTAMP - INTERVAL 11 MINUTE WHERE id_job = ?",
      [TENTATIVI_MASSIMI, secondo.id_job],
    );
    // Un job appena preso in carico non si tocca.
    await pool.query("UPDATE job_elaborazione SET stato = 'IN_CORSO', tentativi = 1 WHERE id_segnalazione = ? AND id_job > ?", [id, secondo.id_job]);

    const esito = await eseguiManutenzione();
    assert.equal(esito.job_ripresi, 2);
    const dopo = await jobDi(id);
    assert.equal(dopo[0].stato, 'COMPLETATO'); // ripreso ed elaborato nella stessa manutenzione
    assert.equal(dopo[1].stato, 'ERRORE');
    assert.equal(dopo[2].stato, 'IN_CORSO');
    assert.equal(await riprendiJobBloccati(), 0);
    await pool.query("UPDATE job_elaborazione SET stato = 'COMPLETATO' WHERE id_segnalazione = ?", [id]);
  });
});

describe('AI_PROVIDER=mistral con l’adapter reale (fetch finto)', () => {
  const cfg = {
    AI_PROVIDER: 'mistral', AI_FALLBACK_PROVIDER: 'regole', MISTRAL_API_KEY: 'chiave-di-prova', MISTRAL_MODEL: 'mistral-small-latest',
    AI_TIMEOUT_MS: 1000, AI_MAX_RETRIES: 0,
  };
  const conFetch = (sequenza) => {
    const fetch = creaFetchFinto(sequenza);
    provider.llm = creaLlmDaConfig(cfg, { fetch, attendi: async () => {} });
    return fetch;
  };
  afterEach(() => {
    provider.llm = llmFinto;
  });

  test('provider non raggiungibile: la segnalazione si crea (201), le analisi finiscono DA_REVISIONARE', async () => {
    conFetch([rete()]);
    const id = await nuovaSegnalazione();
    for (let i = 0; i < TENTATIVI_MASSIMI; i++) {
      await svuota();
      await rendiDisponibili();
    }
    const job = (await jobDi(id)).filter((j) => j.tipo_analisi !== 'ANALISI_IMMAGINE');
    assert.deepEqual(job.map((j) => j.stato), ['ERRORE', 'ERRORE']);
    assert.ok(job.every((j) => !j.ultimo_errore.includes('chiave-di-prova')));
    const nonRiuscite = (await analisiDi(id)).filter((a) => a.risultato.errore === 'PROVIDER_NON_DISPONIBILE');
    assert.deepEqual(nonRiuscite.map((a) => [a.tipo_analisi, a.esito, a.modello]).sort(), [
      ['MODERAZIONE_TESTO', 'DA_REVISIONARE', 'mistral:mistral-small-latest'],
      ['VERIFICA_PERTINENZA', 'DA_REVISIONARE', 'mistral:mistral-small-latest'],
    ]);
  });

  test('provider funzionante: analisi registrate con il modello effettivo', async () => {
    const fetch = conFetch([json(RISPOSTA_TESTO), json(RISPOSTA_PERTINENZA)]);
    const id = await nuovaSegnalazione();
    await svuota();
    assert.equal(fetch.chiamate.length, 2);
    const delModello = (await analisiDi(id)).filter((a) => a.modello === 'mistral:mistral-small-latest');
    assert.deepEqual(delModello.map((a) => [a.tipo_analisi, a.esito]), [
      ['MODERAZIONE_TESTO', 'OK'],
      ['CLASSIFICAZIONE_TESTO', 'OK'],
      ['VERIFICA_PERTINENZA', 'OK'],
    ]);
  });
});
