// Moderazione automatica (auto-nascondi) eseguita dal worker, con un modello linguistico finto.
import { after, afterEach, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { accedi, avvia, chiudi, creaUtente, env, inviaSegnalazione, pool } from './helpers.js';
import { provider } from '../src/ai/index.js';
import { elaboraTutti } from '../src/ai/worker.js';

let autore, agAutore, agModeratore, agAltro;
// Risposta del modello alla prossima analisi del testo; "errore" simula tutti i provider giù.
let giudizio;

const risposta = ({ motivo = null, confidenza = 0.95, accettabile = motivo === null } = {}) => ({
  testo: { accettabile, gravita: motivo ? 'alta' : 'nessuna', motivi: [] },
  motivo,
  confidenza,
  categorie_suggerite: [{ nome: 'Manutenzione stradale', confidenza: 0.9 }],
  esito_suggerito: motivo ? 'BLOCCATO' : 'OK',
  spiegazione: motivo ? `Il testo rientra nel motivo ${motivo}.` : 'Segnalazione civile.',
});

const llmFinto = {
  async analizzaTesto() {
    if (giudizio === 'errore') throw Object.assign(new Error('Servizio non raggiungibile'), { modello: 'finto:modello' });
    return { modello: 'finto:modello', risposta: giudizio };
  },
  async verificaPertinenza() {
    if (giudizio === 'errore') throw Object.assign(new Error('Servizio non raggiungibile'), { modello: 'finto:modello' });
    return {
      modello: 'finto:modello',
      risposta: {
        testo: { accettabile: true, gravita: 'nessuna', motivi: [] },
        immagine: { corrisponde_al_testo: true, corrisponde_alla_categoria: true, categoria_suggerita: null, inappropriata: false, confidenza: 0.9, osservato: 'Una buca' },
        segnale_autenticita: { sembra_generata_o_montata: false, confidenza: 0.1 },
        esito_suggerito: 'OK',
        spiegazione: 'Coerente.',
      },
    };
  },
};

const svuota = async () => {
  for (let i = 0; i < 10 && (await elaboraTutti({ massimo: 50 })) > 0; i++);
};
const rendiDisponibili = () => pool.query('UPDATE job_elaborazione SET disponibile_dal = NULL');
const segnalazione = async (id) => (await pool.query('SELECT nascosta, motivo_nascondimento, data_conferma_nascondimento FROM segnalazione WHERE id_segnalazione = ?', [id]))[0][0];
const operazioni = async (id) =>
  (await pool.query("SELECT azione, id_utente, dettagli FROM log_operazione WHERE entita = 'segnalazione' AND id_entita = ? ORDER BY id_log", [id]))[0];
/** Operazioni senza utente: quelle della moderazione automatica. */
const automatiche = async (id) => (await operazioni(id)).filter((o) => o.id_utente === null);
const moderazioneDelModello = async (id) =>
  (await pool.query("SELECT * FROM analisi_ia WHERE id_segnalazione = ? AND tipo_analisi = 'MODERAZIONE_TESTO' AND modello = 'finto:modello'", [id]))[0][0];

/** Invia una segnalazione e fa girare il worker con il giudizio indicato. */
async function analizzata(g, dati = {}) {
  giudizio = g;
  const res = await inviaSegnalazione(agAutore, { categorie: [1], ...dati });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const id = res.body.segnalazione.id_segnalazione;
  await svuota();
  return id;
}

before(async () => {
  await avvia();
  autore = await creaUtente('CITTADINO');
  agAutore = await accedi(autore);
  agModeratore = await accedi(await creaUtente('MODERATORE'));
  agAltro = await accedi(await creaUtente('CITTADINO'));
  provider.llm = llmFinto;
});
afterEach(async () => {
  env.AI_AUTO_NASCONDI = true;
  env.AI_SOGLIA_AUTO_NASCONDI = 0.9;
});
after(async () => {
  provider.llm = null;
  await chiudi();
});

describe('Auto-nascondi nel worker', () => {
  test('MINACCIA: nascosta con motivazione AUTO_IA, azione automatica nel registro, senza il testo', async () => {
    const id = await analizzata(risposta({ motivo: 'MINACCIA', confidenza: 0.7 }));
    assert.deepEqual(await segnalazione(id), { nascosta: 1, motivo_nascondimento: 'AUTO_IA: MINACCIA', data_conferma_nascondimento: null });
    const analisi = await moderazioneDelModello(id);
    assert.equal(analisi.esito, 'BLOCCATO');
    assert.equal(analisi.risultato.motivo, 'MINACCIA');
    const [op] = (await operazioni(id)).filter((o) => o.azione === 'SEGNALAZIONE_NASCOSTA_AUTO');
    assert.equal(op.id_utente, null, 'nessun utente: azione automatica');
    assert.deepEqual(op.dettagli, { automatica: true, motivo: 'MINACCIA', confidenza: 0.7, modello: 'finto:modello', id_analisi: analisi.id_analisi });
    assert.ok(!JSON.stringify(op.dettagli).includes('Buca'), 'il testo della segnalazione non va nel registro');
  });

  test('NON_SENSATA con confidenza 0,95: nascosta', async () => {
    const id = await analizzata(risposta({ motivo: 'NON_SENSATA', confidenza: 0.95 }));
    assert.equal((await segnalazione(id)).motivo_nascondimento, 'AUTO_IA: NON_SENSATA');
  });

  test('NON_SENSATA con confidenza 0,6: non nascosta, analisi DA_REVISIONARE', async () => {
    const id = await analizzata(risposta({ motivo: 'NON_SENSATA', confidenza: 0.6 }));
    assert.equal((await segnalazione(id)).nascosta, 0);
    const analisi = await moderazioneDelModello(id);
    assert.equal(analisi.esito, 'DA_REVISIONARE');
    assert.deepEqual(analisi.risultato.motivi_esito, ['NON_SENSATA', 'CONFIDENZA_BASSA']);
    assert.ok(!(await operazioni(id)).some((o) => o.azione === 'SEGNALAZIONE_NASCOSTA_AUTO'));
  });

  test('DUBBIO: DA_REVISIONARE, nessuna azione automatica', async () => {
    const id = await analizzata(risposta({ motivo: 'DUBBIO', confidenza: 0.99 }));
    assert.equal((await segnalazione(id)).nascosta, 0);
    assert.equal((await moderazioneDelModello(id)).esito, 'DA_REVISIONARE');
    assert.deepEqual(await automatiche(id), []);
  });

  test('segnalazione normale: visibile, analisi OK, nessuna azione automatica', async () => {
    const id = await analizzata(risposta());
    assert.equal((await segnalazione(id)).nascosta, 0);
    assert.equal((await moderazioneDelModello(id)).esito, 'OK');
    assert.deepEqual(await automatiche(id), []);
  });

  test('AI_AUTO_NASCONDI=false: esito BLOCCATO registrato ma la segnalazione resta visibile', async () => {
    env.AI_AUTO_NASCONDI = false;
    const id = await analizzata(risposta({ motivo: 'ODIO' }));
    assert.equal((await segnalazione(id)).nascosta, 0);
    assert.equal((await moderazioneDelModello(id)).esito, 'BLOCCATO');
    assert.deepEqual(await automatiche(id), []);
  });

  test('tutti i provider falliscono: mai nascosta, analisi DA_REVISIONARE dopo i tentativi', async () => {
    const id = await analizzata('errore');
    for (let i = 0; i < 3; i++) {
      await rendiDisponibili();
      await svuota();
    }
    assert.equal((await segnalazione(id)).nascosta, 0);
    const nonRiuscita = await moderazioneDelModello(id);
    assert.deepEqual([nonRiuscita.esito, nonRiuscita.risultato.errore], ['DA_REVISIONARE', 'PROVIDER_NON_DISPONIBILE']);
  });

  test('segnalazione già nascosta dal comitato: il worker non la tocca', async () => {
    giudizio = 'errore';
    const res = await inviaSegnalazione(agAutore, { categorie: [1] });
    const id = res.body.segnalazione.id_segnalazione;
    assert.equal((await agModeratore.post(`/api/v1/moderazione/segnalazioni/${id}/nascondi`).send({ motivazione: 'Doppione di un’altra' })).status, 200);
    giudizio = risposta({ motivo: 'MINACCIA' });
    await svuota();
    assert.equal((await segnalazione(id)).motivo_nascondimento, 'Doppione di un’altra');
  });
});

describe('Comitato e cittadino', () => {
  test('il cittadino vede solo "in revisione", senza il motivo; gli altri non la vedono', async () => {
    const id = await analizzata(risposta({ motivo: 'INSULTO_GRAVE' }));
    const mia = (await agAutore.get(`/api/v1/segnalazioni/${id}`)).body.segnalazione;
    assert.equal(mia.nascosta, true);
    assert.equal(mia.in_revisione, true);
    assert.equal(mia.motivo_nascondimento, null);
    assert.ok(!JSON.stringify(mia).includes('INSULTO_GRAVE'));
    assert.equal((await agAltro.get(`/api/v1/segnalazioni/${id}`)).status, 404);
    const comitato = (await agModeratore.get(`/api/v1/segnalazioni/${id}`)).body.segnalazione;
    assert.deepEqual([comitato.motivo_nascondimento, comitato.nascosta_da_ia, comitato.nascondimento_confermato], ['AUTO_IA: INSULTO_GRAVE', true, false]);
  });

  test('coda del comitato: sezione "nascoste dall’IA" con motivo, confidenza e spiegazione; "da revisionare" a parte', async () => {
    const nascosta = await analizzata(risposta({ motivo: 'SPAM_PUBBLICITA', confidenza: 0.97 }));
    const dubbia = await analizzata(risposta({ motivo: 'DUBBIO', confidenza: 0.5 }));
    const elenco = async (vista) => (await agModeratore.get('/api/v1/moderazione/segnalazioni').query({ vista, perPagina: 50 })).body.dati;

    const nascoste = await elenco('nascoste_ia');
    const s = nascoste.find((x) => x.id_segnalazione === nascosta);
    assert.ok(s);
    assert.equal(s.ia.esito, 'BLOCCATO');
    assert.deepEqual(
      [s.ia.moderazione.motivo, s.ia.moderazione.confidenza, s.ia.moderazione.spiegazione],
      ['SPAM_PUBBLICITA', 0.97, 'Il testo rientra nel motivo SPAM_PUBBLICITA.'],
    );
    assert.ok(!nascoste.some((x) => x.id_segnalazione === dubbia));

    const daRevisionare = await elenco('da_revisionare');
    const d = daRevisionare.find((x) => x.id_segnalazione === dubbia);
    assert.equal(d.ia.esito, 'DA_REVISIONARE');
    assert.equal(d.ia.moderazione.motivo, 'DUBBIO');
    assert.deepEqual(d.ia.categorie_suggerite.map((c) => c.nome), ['Manutenzione stradale']);
    assert.ok(!daRevisionare.some((x) => x.id_segnalazione === nascosta));
  });

  test('ripristino da parte del comitato: torna visibile, giudizio del modello respinto, azione nel registro', async () => {
    const id = await analizzata(risposta({ motivo: 'NON_PERTINENTE', confidenza: 0.92 }));
    const res = await agModeratore.post(`/api/v1/moderazione/segnalazioni/${id}/mostra`);
    assert.equal(res.status, 200);
    assert.equal(res.body.segnalazione.nascosta, false);
    assert.equal((await segnalazione(id)).nascosta, 0);
    assert.equal((await moderazioneDelModello(id)).esito_revisione, 'RESPINTA');
    // L'analisi a regole (esito OK) non era il motivo del nascondimento: resta com'era.
    const [[regole]] = await pool.query("SELECT esito_revisione FROM analisi_ia WHERE id_segnalazione = ? AND tipo_analisi = 'MODERAZIONE_TESTO' AND modello LIKE 'regole-%'", [id]);
    assert.equal(regole.esito_revisione, null);
    const op = (await operazioni(id)).find((o) => o.azione === 'SEGNALAZIONE_RIPRISTINATA');
    assert.ok(op.id_utente, 'azione del comitato, con l’utente');
    assert.deepEqual([op.dettagli.nascosta_da_ia, op.dettagli.motivo_ia], [true, 'NON_PERTINENTE']);
  });

  test('conferma della nascosta: resta nascosta, esce dalla sezione, azione nel registro', async () => {
    const id = await analizzata(risposta({ motivo: 'CONTENUTO_SESSUALE' }));
    const res = await agModeratore.post(`/api/v1/moderazione/segnalazioni/${id}/conferma-nascosta`);
    assert.equal(res.status, 200);
    assert.equal(res.body.segnalazione.nascondimento_confermato, true);
    const s = await segnalazione(id);
    assert.equal(s.nascosta, 1);
    assert.ok(s.data_conferma_nascondimento);
    assert.equal((await moderazioneDelModello(id)).esito_revisione, 'CONFERMATA');
    assert.ok((await operazioni(id)).some((o) => o.azione === 'NASCONDIMENTO_IA_CONFERMATO' && o.id_utente));
    const nascoste = (await agModeratore.get('/api/v1/moderazione/segnalazioni').query({ vista: 'nascoste_ia', perPagina: 50 })).body.dati;
    assert.ok(!nascoste.some((x) => x.id_segnalazione === id));
    // Una seconda conferma non ha senso.
    assert.equal((await agModeratore.post(`/api/v1/moderazione/segnalazioni/${id}/conferma-nascosta`)).status, 409);
  });

  test('conferma solo per le nascoste dall’IA; il prefisso AUTO_IA non si usa a mano; solo il comitato', async () => {
    const id = await analizzata(risposta());
    assert.equal((await agModeratore.post(`/api/v1/moderazione/segnalazioni/${id}/conferma-nascosta`)).status, 409);
    const manuale = await agModeratore.post(`/api/v1/moderazione/segnalazioni/${id}/nascondi`).send({ motivazione: 'AUTO_IA: MINACCIA' });
    assert.equal(manuale.status, 400);
    assert.equal((await agAltro.post(`/api/v1/moderazione/segnalazioni/${id}/conferma-nascosta`)).status, 403);
  });
});
