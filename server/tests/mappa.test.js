// Il finto Nominatim imposta GEOCODING_URL con un await di primo livello: i moduli che
// leggono la configurazione vanno quindi importati dopo, con import dinamici.
import { richieste, server as nominatim, stato } from './nominatim-finto.js';
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

const { accedi, anonimo, avvia, cambiaStato, chiudi, creaUtente, env, inviaSegnalazione } = await import('./helpers.js');
const { quartiereCorrispondente, svuotaCache } = await import('../src/services/geocodifica.service.js');

let ag;
let agMod;

before(async () => {
  assert.equal(env.GEOCODING_URL, process.env.GEOCODING_URL, 'i test devono usare il finto Nominatim');
  await avvia();
  ag = await accedi(await creaUtente());
  agMod = await accedi(await creaUtente('MODERATORE'));
});
after(async () => {
  nominatim.close();
  await chiudi();
});
beforeEach(() => {
  svuotaCache();
  stato.errore = false;
  stato.risposte429 = 0;
});

describe('Tessere della mappa', () => {
  test('Referrer-Policy invia l’origine (OpenStreetMap blocca le tessere senza Referer)', async () => {
    const res = await anonimo().get('/mappa');
    assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.match(res.headers['content-security-policy'], /img-src[^;]*https:\/\/tile\.openstreetmap\.org/);
  });
});

describe('Geocodifica (RF14)', () => {
  test('solo per utenti autenticati', async () => {
    await anonimo().get('/api/v1/geocodifica/cerca').query({ q: 'via padova' }).expect(401);
  });

  test('ricerca: indirizzo, coordinate e quartiere suggerito; area limitata a Milano', async () => {
    const res = await ag.get('/api/v1/geocodifica/cerca').query({ q: 'via angelo della pergola 1' });
    assert.equal(res.status, 200);
    const [r] = res.body.dati;
    assert.equal(r.indirizzo, 'Via Angelo della Pergola 1');
    assert.equal(r.latitudine, 45.487912);
    assert.equal(r.quartiere.nome, 'Isola');
    const ultima = richieste.at(-1);
    assert.equal(ultima.parametri.bounded, '1');
    assert.equal(ultima.parametri.countrycodes, 'it');
    assert.match(ultima.intestazioni['user-agent'], /^LaNostraCitta\//);
    assert.equal(ultima.intestazioni.referer, 'http://localhost:3000');
  });

  test('ricerche uguali servite dalla cache, senza nuove chiamate al servizio', async () => {
    const prima = richieste.length;
    await ag.get('/api/v1/geocodifica/cerca').query({ q: 'piazza isola' }).expect(200);
    await ag.get('/api/v1/geocodifica/cerca').query({ q: 'piazza isola' }).expect(200);
    assert.equal(richieste.length, prima + 1);
  });

  test('nessun risultato e testo troppo corto', async () => {
    const vuota = await ag.get('/api/v1/geocodifica/cerca').query({ q: 'via inesistente' });
    assert.deepEqual(vuota.body.dati, []);
    await ag.get('/api/v1/geocodifica/cerca').query({ q: 'ab' }).expect(400);
  });

  test('inversa: indirizzo del punto e quartiere dal nome della zona', async () => {
    const res = await ag.get('/api/v1/geocodifica/inversa').query({ lat: 45.4781, lon: 9.1238 });
    assert.equal(res.body.risultato.indirizzo, 'Piazzale Angelo Moratti');
    assert.equal(res.body.risultato.quartiere.nome, 'San Siro'); // dal nome della zona (il Municipio 7 ha più quartieri)
    await ag.get('/api/v1/geocodifica/inversa').query({ lat: 95, lon: 9 }).expect(400);
  });

  test('429 dal servizio: attende e riprova una volta; se persiste → 503 "occupato"', async () => {
    stato.risposte429 = 1;
    const prima = richieste.length;
    const ok = await ag.get('/api/v1/geocodifica/cerca').query({ q: 'via padova 2' });
    assert.equal(ok.status, 200);
    assert.equal(richieste.length, prima + 2);

    stato.risposte429 = 5;
    const ko = await ag.get('/api/v1/geocodifica/cerca').query({ q: 'via padova 3' });
    assert.equal(ko.status, 503);
    assert.equal(ko.body.error.code, 'GEOCODIFICA_OCCUPATA');
  });

  test('servizio non raggiungibile → 503 con messaggio chiaro', async () => {
    stato.errore = true;
    const res = await ag.get('/api/v1/geocodifica/cerca').query({ q: 'via padova 1' });
    assert.equal(res.status, 503);
    assert.equal(res.body.error.code, 'GEOCODIFICA_NON_DISPONIBILE');
  });

  test('corrispondenza dei quartieri: nome della zona, municipio ambiguo ignorato', () => {
    const quartieri = [
      { id_quartiere: 1, nome: 'Isola', municipio: 9 },
      { id_quartiere: 2, nome: 'Bicocca', municipio: 9 },
      { id_quartiere: 3, nome: 'Città Studi', municipio: 3 },
    ];
    assert.equal(quartiereCorrispondente({ neighbourhood: 'Citta Studi' }, quartieri).id_quartiere, 3);
    assert.equal(quartiereCorrispondente({ suburb: 'Municipio 9' }, quartieri), null);
    assert.equal(quartiereCorrispondente({ suburb: 'Municipio 3' }, quartieri).id_quartiere, 3);
    assert.equal(quartiereCorrispondente({ town: 'Sesto San Giovanni', suburb: 'Municipio 9' }, [...quartieri, { id_quartiere: 4, nome: 'Sesto San Giovanni', municipio: null }]).id_quartiere, 4, 'comune dell’hinterland');
    assert.equal(quartiereCorrispondente({ neighbourhood: 'Sant’Ambrogio' }, [{ id_quartiere: 5, nome: 'Sant\'Ambrogio', municipio: 1 }]).id_quartiere, 5, 'apostrofo tipografico');
    assert.equal(quartiereCorrispondente(null, quartieri), null);
  });
});

describe('Segnalazioni sulla mappa', () => {
  test('posizione da indirizzo cercato e punto con foto di copertina nella mappa pubblica', async () => {
    const res = await inviaSegnalazione(ag, {
      categorie: [7],
      latitudine: '45.487912',
      longitudine: '9.188646',
      origine_coordinate: 'GEOCODIFICA',
      indirizzo: 'Via Angelo della Pergola 1',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.segnalazione.origine_coordinate, 'GEOCODIFICA');
    const id = res.body.segnalazione.id_segnalazione;
    await cambiaStato(agMod, id, 'APPROVATA').expect(200);

    const mappa = await anonimo().get('/api/v1/segnalazioni/mappa');
    const punto = mappa.body.dati.find((p) => p.id_segnalazione === id);
    assert.equal(punto.indirizzo, 'Via Angelo della Pergola 1');
    assert.equal(punto.copertina.tipo_media, 'IMMAGINE');
  });
});
