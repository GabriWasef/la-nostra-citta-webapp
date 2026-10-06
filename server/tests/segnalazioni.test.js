import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accedi, anonimo, avvia, cambiaStato, chiudi, creaUtente, fileSalvati, inviaSegnalazione, jpeg, pool,
} from './helpers.js';
import { elaboraTutti } from '../src/ai/worker.js';

let autore, altro, moderatore, agAutore, agAltro, agMod;

before(async () => {
  await avvia();
  autore = await creaUtente();
  altro = await creaUtente();
  moderatore = await creaUtente('MODERATORE');
  [agAutore, agAltro, agMod] = await Promise.all([accedi(autore), accedi(altro), accedi(moderatore)]);
});
after(chiudi);

async function pubblicata(dati = {}) {
  const res = await inviaSegnalazione(agAutore, { categorie: [7], ...dati });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const id = res.body.segnalazione.id_segnalazione;
  await cambiaStato(agMod, id, 'APPROVATA').expect(200);
  return id;
}

describe('Inserimento (RF05, RF06)', () => {
  test('solo utenti autenticati', async () => {
    const res = await inviaSegnalazione(anonimo());
    assert.equal(res.status, 401);
  });

  test('senza allegato → 400 ALLEGATO_OBBLIGATORIO', async () => {
    const res = await inviaSegnalazione(agAutore, {}, []);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'ALLEGATO_OBBLIGATORIO');
  });

  test('file con estensione falsificata → 400 e nessun file salvato', async () => {
    const prima = await fileSalvati();
    const res = await inviaSegnalazione(agAutore, {}, [{ buffer: Buffer.from('<?php echo "x"; ?>'), nome: 'foto.jpg' }]);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'FILE_NON_VALIDO');
    assert.equal(await fileSalvati(), prima);
  });

  test('formato non ammesso → 400', async () => {
    const res = await inviaSegnalazione(agAutore, {}, [{ buffer: Buffer.from('%PDF-1.4'), nome: 'documento.pdf' }]);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'FILE_NON_AMMESSO');
  });

  test('titolo e descrizione validati dal server', async () => {
    const res = await inviaSegnalazione(agAutore, { titolo: 'Ab', descrizione: 'corta' });
    assert.equal(res.status, 400);
    const campi = res.body.error.details.map((d) => d.campo);
    assert.deepEqual(campi.sort(), ['descrizione', 'titolo']);
  });

  test('creazione: stato Inserita, allegato ricodificato senza EXIF, storico con autore', async () => {
    const res = await inviaSegnalazione(agAutore, { categorie: [7, 6], visibilita: 'ANONIMA' });
    assert.equal(res.status, 201);
    const s = res.body.segnalazione;
    assert.equal(s.stato.codice, 'INSERITA');
    assert.deepEqual(s.categorie.map((c) => c.id_categoria).sort(), [6, 7]);
    assert.equal(s.allegati.length, 1);

    const file = await anonimo().get(s.allegati[0].url);
    assert.equal(file.status, 404, 'non ancora pubblica: allegato non visibile agli anonimi');
    const proprio = await agAutore.get(s.allegati[0].url);
    assert.equal(proprio.status, 200);
    assert.equal(proprio.headers['content-type'], 'image/jpeg');

    const [storico] = await pool.query('SELECT id_utente_operatore, motivazione FROM storico_stato WHERE id_segnalazione = ?', [s.id_segnalazione]);
    assert.equal(storico.length, 1);
    assert.equal(storico[0].id_utente_operatore, autore.id_utente);
  });

  test('posizione dai metadati GPS della foto (RF14) e coordinate EXIF riservate al comitato', async () => {
    const buffer = await jpeg({ gps: [45.4781, 9.2268] });
    const res = await inviaSegnalazione(agAutore, { usa_posizione_foto: 'true', categorie: [7] }, [{ buffer, nome: 'gps.jpg' }]);
    assert.equal(res.status, 201);
    const s = res.body.segnalazione;
    assert.equal(s.origine_coordinate, 'EXIF');
    assert.ok(Math.abs(s.latitudine - 45.4781) < 0.001);
    assert.equal(s.allegati[0].latitudine_exif, undefined, 'l’autore non vede le coordinate EXIF');

    const perMod = await agMod.get(`/api/v1/segnalazioni/${s.id_segnalazione}`);
    assert.ok(Math.abs(perMod.body.segnalazione.allegati[0].latitudine_exif - 45.4781) < 0.001);

    const exifr = (await import('exifr')).default;
    const pubblicato = await agAutore.get(s.allegati[0].url).buffer(true);
    assert.equal(await exifr.gps(pubblicato.body).catch(() => undefined), undefined, 'GPS rimosso dal file pubblicato');
  });

  test('senza consenso la posizione della foto non viene usata', async () => {
    const buffer = await jpeg({ gps: [45.47, 9.2] });
    const res = await inviaSegnalazione(agAutore, { usa_posizione_foto: 'false' }, [{ buffer, nome: 'gps.jpg' }]);
    assert.equal(res.body.segnalazione.latitudine, null);
  });

  test('moderazione automatica: minacce bloccate, insulti segnalati per la revisione (RF11)', async () => {
    const bloccata = await inviaSegnalazione(agAutore, { descrizione: 'Se trovo chi ha fatto questa buca lo ammazzo, siete avvisati tutti.' });
    assert.equal(bloccata.status, 422);
    assert.equal(bloccata.body.error.code, 'CONTENUTO_NON_AMMESSO');

    const dubbia = await inviaSegnalazione(agAutore, { descrizione: 'Gli idioti del comune non riparano mai questa buca enorme in strada.' });
    assert.equal(dubbia.status, 201);
    const coda = await agMod.get('/api/v1/moderazione/segnalazioni').query({ stato: 'INSERITA', perPagina: 50 });
    const voce = coda.body.dati.find((x) => x.id_segnalazione === dubbia.body.segnalazione.id_segnalazione);
    assert.equal(voce.da_revisionare_ia, true);
  });

  test('senza categorie scelte vengono proposte dall’IA con affidabilità (RF12)', async () => {
    const res = await inviaSegnalazione(agAutore, {
      titolo: 'Lampione spento da settimane',
      descrizione: 'Il lampione all’angolo è spento da settimane e la sera la strada è completamente al buio.',
    });
    const cat = res.body.segnalazione.categorie;
    assert.ok(cat.some((c) => c.nome === 'Illuminazione' && c.origine_assegnazione === 'IA' && c.affidabilita_ia > 0));
  });
});

describe('Visibilità e ricerca (RF08)', () => {
  test('le segnalazioni non approvate o PRIVATE non compaiono in pubblico', async () => {
    const pubblica = await pubblicata({ titolo: 'Segnalazione pubblica visibile' });
    const privata = await pubblicata({ titolo: 'Segnalazione riservata comitato', visibilita: 'PRIVATA' });
    const elenco = await anonimo().get('/api/v1/segnalazioni').query({ perPagina: 50 });
    const ids = elenco.body.dati.map((s) => s.id_segnalazione);
    assert.ok(ids.includes(pubblica));
    assert.ok(!ids.includes(privata));
    await anonimo().get(`/api/v1/segnalazioni/${privata}`).expect(404);
    await agAltro.get(`/api/v1/segnalazioni/${privata}`).expect(404);
    await agAutore.get(`/api/v1/segnalazioni/${privata}`).expect(200);
  });

  test('autore anonimo nascosto al pubblico, visibile al comitato', async () => {
    const id = await pubblicata({ visibilita: 'ANONIMA' });
    const pub = await anonimo().get(`/api/v1/segnalazioni/${id}`);
    assert.equal(pub.body.segnalazione.autore, null);
    const mod = await agMod.get(`/api/v1/segnalazioni/${id}`);
    assert.equal(mod.body.segnalazione.autore.id_utente, autore.id_utente);
  });

  test('filtri per quartiere, categoria, stato, ricerca testuale e paginazione', async () => {
    const id = await pubblicata({ titolo: 'Semaforo guasto in Isola', descrizione: 'Il semaforo pedonale di piazza Minniti lampeggia da giorni.', id_quartiere: 3, categorie: [9] });
    const q = await anonimo().get('/api/v1/segnalazioni').query({ quartiere: 3, categoria: 9, stato: 'APPROVATA', q: 'semaforo' });
    assert.deepEqual(q.body.dati.map((s) => s.id_segnalazione), [id]);
    const pag = await anonimo().get('/api/v1/segnalazioni').query({ perPagina: 1, pagina: 1 });
    assert.equal(pag.body.dati.length, 1);
    assert.ok(pag.body.paginazione.pagine >= 2);
    const invalido = await anonimo().get('/api/v1/segnalazioni').query({ perPagina: 1000 });
    assert.equal(invalido.status, 400);
  });
});

describe('Sostegno (RF09)', () => {
  test('sostegno, duplicato, autosostegno e revoca; conteggio dai record reali', async () => {
    const id = await pubblicata();
    const r1 = await agAltro.post(`/api/v1/segnalazioni/${id}/sostegno`);
    assert.equal(r1.status, 201);
    assert.equal(r1.body.numero_sostegni, 1);
    const dup = await agAltro.post(`/api/v1/segnalazioni/${id}/sostegno`);
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'SOSTEGNO_DUPLICATO');
    const auto = await agAutore.post(`/api/v1/segnalazioni/${id}/sostegno`);
    assert.equal(auto.status, 403);
    await agMod.post(`/api/v1/segnalazioni/${id}/sostegno`).expect(201);

    const dettaglio = await agAltro.get(`/api/v1/segnalazioni/${id}`);
    assert.equal(dettaglio.body.segnalazione.numero_sostegni, 2);
    assert.equal(dettaglio.body.segnalazione.sostenuta, true);

    const revoca = await agAltro.delete(`/api/v1/segnalazioni/${id}/sostegno`);
    assert.equal(revoca.body.numero_sostegni, 1);
    await agAltro.delete(`/api/v1/segnalazioni/${id}/sostegno`).expect(404);
    await anonimo().post(`/api/v1/segnalazioni/${id}/sostegno`).expect(401);
  });

  test('non si sostiene una segnalazione non ancora pubblicata', async () => {
    const res = await inviaSegnalazione(agAutore);
    const id = res.body.segnalazione.id_segnalazione;
    const r = await agMod.post(`/api/v1/segnalazioni/${id}/sostegno`);
    assert.equal(r.status, 422);
  });

  test('classifica ordinata per sostegni', async () => {
    const res = await anonimo().get('/api/v1/classifica');
    const numeri = res.body.dati.map((s) => s.numero_sostegni);
    assert.deepEqual(numeri, [...numeri].sort((a, b) => b - a));
  });
});

describe('Visibilità degli elenchi', () => {
  test('la classifica comprende anche le segnalazioni pubblicate con 0 sostegni, ed è paginata', async () => {
    const id = await pubblicata({ titolo: 'Segnalazione senza sostegni' });
    const tutte = await anonimo().get('/api/v1/classifica').query({ limite: 100 });
    const riga = tutte.body.dati.find((r) => r.id_segnalazione === id);
    assert.ok(riga, 'compare in classifica');
    assert.equal(riga.numero_sostegni, 0);
    assert.equal(tutte.body.paginazione.totale, tutte.body.dati.length);

    const prima = await anonimo().get('/api/v1/classifica').query({ limite: 1, pagina: 1 });
    const seconda = await anonimo().get('/api/v1/classifica').query({ limite: 1, pagina: 2 });
    assert.equal(prima.body.dati.length, 1);
    assert.equal(seconda.body.paginazione.pagina, 2);
    assert.equal(prima.body.paginazione.totale, tutte.body.paginazione.totale);
    assert.notEqual(prima.body.dati[0].id_segnalazione, seconda.body.dati[0]?.id_segnalazione);
  });

  test('l’elenco: i cittadini vedono le pubblicate e le proprie in attesa; il comitato vede tutte', async () => {
    const inAttesa = (await inviaSegnalazione(agAutore, { titolo: 'In attesa di approvazione' })).body.segnalazione.id_segnalazione;
    const privata = (await inviaSegnalazione(agAutore, { titolo: 'Segnalazione privata', visibilita: 'PRIVATA' })).body.segnalazione.id_segnalazione;
    const ids = async (agente) => (await agente.get('/api/v1/segnalazioni').query({ perPagina: 50 })).body.dati.map((s) => s.id_segnalazione);

    const anon = await ids(anonimo());
    assert.ok(!anon.includes(inAttesa) && !anon.includes(privata), 'gli anonimi non vedono segnalazioni non pubblicate');
    const proprie = await ids(agAutore);
    assert.ok(proprie.includes(inAttesa) && proprie.includes(privata), 'l’autore vede le proprie');
    assert.ok(!(await ids(agAltro)).includes(inAttesa), 'un altro cittadino no');
    const comitato = await ids(agMod);
    assert.ok(comitato.includes(inAttesa) && comitato.includes(privata), 'il moderatore vede tutte');
    const totale = (await agMod.get('/api/v1/moderazione/segnalazioni').query({ perPagina: 1 })).body.paginazione.totale;
    assert.equal((await agMod.get('/api/v1/segnalazioni').query({ perPagina: 1 })).body.paginazione.totale, totale);
  });
});

describe('Quartieri', () => {
  test('quartieri di Milano e dei comuni vicini, ricercabili per nome', async () => {
    const { body } = await anonimo().get('/api/v1/quartieri');
    const nomi = body.dati.map((q) => q.nome);
    assert.ok(nomi.length >= 100);
    for (const n of ['Isola', 'Navigli', 'Città Studi', 'Quarto Oggiaro', 'Sesto San Giovanni', 'Sant\'Ambrogio']) assert.ok(nomi.includes(n), n);
    assert.equal(new Set(nomi).size, nomi.length, 'nessun duplicato');
    const ordinati = [...nomi].sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
    assert.deepEqual(nomi.map((n) => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')).slice(0, 3), ordinati.map((n) => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')).slice(0, 3));
  });
});

describe('Ciclo di vita e moderazione (RF10)', () => {
  test('i cittadini non accedono alla moderazione', async () => {
    await agAltro.get('/api/v1/moderazione/segnalazioni').expect(403);
    await anonimo().get('/api/v1/moderazione/segnalazioni').expect(401);
  });

  test('approvazione senza categoria bloccata dal database', async () => {
    const res = await inviaSegnalazione(agAutore, { titolo: 'Richiesta generica di intervento', descrizione: 'Testo senza parole chiave riconoscibili per nessuna categoria.' });
    const id = res.body.segnalazione.id_segnalazione;
    assert.equal(res.body.segnalazione.categorie.length, 0);
    const r = await cambiaStato(agMod, id, 'APPROVATA');
    assert.equal(r.status, 422);
    assert.match(r.body.error.message, /almeno una categoria/);
    await agMod.put(`/api/v1/moderazione/segnalazioni/${id}/categorie`).send({ categorie: [4] }).expect(200);
    await cambiaStato(agMod, id, 'APPROVATA').expect(200);
  });

  test('transizioni ammesse, rifiuto con motivazione, storico con operatore', async () => {
    const res = await inviaSegnalazione(agAutore, { categorie: [7] });
    const id = res.body.segnalazione.id_segnalazione;
    const salto = await cambiaStato(agMod, id, 'CHIUSA');
    assert.equal(salto.status, 422);
    assert.equal(salto.body.error.code, 'TRANSIZIONE_NON_AMMESSA');
    const senzaMotivo = await agMod.patch(`/api/v1/moderazione/segnalazioni/${id}/stato`).send({ codice: 'RIFIUTATA' });
    assert.equal(senzaMotivo.status, 400);

    await cambiaStato(agMod, id, 'IN_VERIFICA', 'Controllo in corso').expect(200);
    await cambiaStato(agMod, id, 'APPROVATA', 'Sopralluogo fatto').expect(200);
    await cambiaStato(agMod, id, 'PRESA_IN_CARICO', 'Segnalata al Municipio').expect(200);

    const storico = await agMod.get(`/api/v1/segnalazioni/${id}/storico`);
    assert.deepEqual(storico.body.dati.map((v) => v.codice_stato), ['INSERITA', 'IN_VERIFICA', 'APPROVATA', 'PRESA_IN_CARICO']);
    assert.equal(storico.body.dati[3].motivazione, 'Segnalata al Municipio');
    assert.equal(storico.body.dati[3].operatore, `${moderatore.nome} ${moderatore.cognome}`);
    const pubblico = await anonimo().get(`/api/v1/segnalazioni/${id}/storico`);
    assert.equal(pubblico.body.dati[3].operatore, 'Comitato');

    const [[variabili]] = await pool.query('SELECT @lnc_id_operatore AS op');
    assert.equal(variabili.op, null);
  });

  test('l’unico allegato e l’unica categoria di una segnalazione pubblicata non si rimuovono', async () => {
    const id = await pubblicata();
    const dettaglio = await agMod.get(`/api/v1/segnalazioni/${id}`);
    const idAllegato = dettaglio.body.segnalazione.allegati[0].id_allegato;
    const del = await agMod.delete(`/api/v1/moderazione/allegati/${idAllegato}`);
    assert.equal(del.status, 422);
    assert.match(del.body.error.message, /unico allegato/);
    const vuote = await agMod.put(`/api/v1/moderazione/segnalazioni/${id}/categorie`).send({ categorie: [] });
    assert.equal(vuote.status, 400);
    const sostituite = await agMod.put(`/api/v1/moderazione/segnalazioni/${id}/categorie`).send({ categorie: [8] });
    assert.deepEqual(sostituite.body.segnalazione.categorie.map((c) => c.id_categoria), [8]);
  });

  test('analisi IA: worker asincrono e revisione del moderatore (RF13)', async () => {
    const res = await inviaSegnalazione(agAutore, {}, [{ buffer: await jpeg({ larghezza: 200, altezza: 150 }), nome: 'piccola.jpg' }]);
    const id = res.body.segnalazione.id_segnalazione;
    assert.ok((await elaboraTutti()) >= 1);
    const { body } = await agMod.get(`/api/v1/moderazione/segnalazioni/${id}/analisi`);
    const tipi = body.dati.map((a) => a.tipo_analisi);
    for (const t of ['MODERAZIONE_TESTO', 'CLASSIFICAZIONE_TESTO', 'ESTRAZIONE_EXIF', 'ANALISI_IMMAGINE']) assert.ok(tipi.includes(t), t);
    const immagine = body.dati.find((a) => a.tipo_analisi === 'ANALISI_IMMAGINE');
    assert.equal(immagine.esito, 'DA_REVISIONARE');
    assert.ok(immagine.risultato.problemi.includes('RISOLUZIONE_BASSA'));

    const rev = await agMod.patch(`/api/v1/moderazione/analisi/${immagine.id_analisi}`).send({ esito_revisione: 'CONFERMATA' });
    assert.equal(rev.body.dati.find((a) => a.id_analisi === immagine.id_analisi).esito_revisione, 'CONFERMATA');
  });
});
