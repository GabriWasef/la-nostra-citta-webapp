// Verifica di autenticità delle foto: posizione EXIF, foto riusate (pHash), segnale del modello.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { accedi, avvia, chiudi, creaUtente, inviaSegnalazione, jpeg, pool } from './helpers.js';
import { distanzaMetri, verificaAutenticita } from '../src/ai/autenticita.js';
import { distanzaHamming, DISTANZA_MASSIMA, hashPercettivo } from '../src/ai/phash.js';
import { svuotaCoda } from '../src/ai/worker.js';

// Piazza del Duomo e Castello Sforzesco, Milano: circa 1 km.
const DUOMO = [45.4642, 9.19];
const CASTELLO = [45.4705, 9.1795];

/** Immagine simile a una foto (sfondo e forme colorate): semi diversi danno foto diverse. */
async function immagineConTrama(seme, { exif } = {}) {
  let r = seme * 9301 + 49297;
  const caso = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  let forme = '';
  for (let i = 0; i < 12; i++) {
    const colore = `rgb(${Math.floor(caso() * 255)},${Math.floor(caso() * 255)},${Math.floor(caso() * 255)})`;
    forme += caso() < 0.5
      ? `<rect x="${caso() * 560}" y="${caso() * 400}" width="${40 + caso() * 200}" height="${40 + caso() * 160}" fill="${colore}"/>`
      : `<circle cx="${caso() * 640}" cy="${caso() * 480}" r="${20 + caso() * 110}" fill="${colore}"/>`;
  }
  const sfondo = (seme * 123457 % 0xffffff).toString(16).padStart(6, '0');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#${sfondo}"/>${forme}</svg>`;
  let img = sharp(Buffer.from(svg)).jpeg({ quality: 90 });
  if (exif) img = img.withExif(exif);
  return img.toBuffer();
}
/** Come la stessa foto inoltrata da un'app di messaggistica: ridimensionata e ricompressa. */
const ricomprimi = (foto) => sharp(foto).resize(560).jpeg({ quality: 80 }).toBuffer();

const segnalazione = (extra = {}) => ({
  latitudine: DUOMO[0], longitudine: DUOMO[1], origine_coordinate: 'MAPPA', data_inserimento: new Date('2026-06-01T10:00:00Z'), ...extra,
});
const allegato = (extra = {}) => ({ latitudine_exif: null, longitudine_exif: null, hash_percettivo: '0f1e2d3c4b5a6978', data_scatto_exif: null, ...extra });
const verifica = (dati = {}) =>
  verificaAutenticita({ allegato: allegato(), segnalazione: segnalazione(), simili: [], pertinenza: null, distanzaMassimaM: 100, ...dati });
const pertinenzaSospetta = (confidenza = 0.9) => ({
  modello: 'mistral:mistral-small-latest',
  risultato: { segnale_autenticita: { sembra_generata_o_montata: true, confidenza } },
});

describe('Verifica di autenticità (regole)', () => {
  test('distanza tra due punti', () => {
    const d = distanzaMetri(...DUOMO, ...CASTELLO);
    assert.ok(d > 900 && d < 1100, String(d));
    assert.equal(distanzaMetri(...DUOMO, ...DUOMO), 0);
  });

  test('posizione EXIF oltre la soglia → DA_REVISIONARE', () => {
    const r = verifica({ allegato: allegato({ latitudine_exif: CASTELLO[0], longitudine_exif: CASTELLO[1] }) });
    assert.equal(r.esito, 'DA_REVISIONARE');
    assert.equal(r.risultato.exif.stato, 'INCOERENTE');
    assert.ok(r.risultato.exif.distanza_m > 100);
    assert.deepEqual(r.risultato.motivi_esito, ['EXIF_POSIZIONE_LONTANA']);
  });

  test('posizione EXIF entro la soglia → OK; la soglia è configurabile', () => {
    const vicino = allegato({ latitudine_exif: 45.4645, longitudine_exif: 9.1902 });
    assert.equal(verifica({ allegato: vicino }).risultato.exif.stato, 'COERENTE');
    assert.equal(verifica({ allegato: vicino }).esito, 'OK');
    assert.equal(verifica({ allegato: vicino, distanzaMassimaM: 10 }).esito, 'DA_REVISIONARE');
  });

  test('metadati assenti: "non verificabile", non è un errore né un indizio', () => {
    const r = verifica();
    assert.equal(r.esito, 'OK');
    assert.equal(r.risultato.exif.stato, 'NON_VERIFICABILE');
    const senzaPosizione = verifica({
      allegato: allegato({ latitudine_exif: CASTELLO[0], longitudine_exif: CASTELLO[1] }),
      segnalazione: segnalazione({ latitudine: null, longitudine: null }),
    });
    assert.equal(senzaPosizione.risultato.exif.stato, 'NON_VERIFICABILE');
    assert.equal(senzaPosizione.esito, 'OK');
  });

  test('data di scatto: solo informativa', () => {
    const r = verifica({ allegato: allegato({ data_scatto_exif: new Date('2024-06-01T10:00:00Z') }) });
    assert.equal(r.risultato.exif.giorni_prima_dell_invio, 730);
    assert.equal(r.esito, 'OK');
  });

  test('foto già usata in un’altra segnalazione → DA_REVISIONARE con l’id della precedente', () => {
    const r = verifica({ simili: [{ id_allegato: 3, id_segnalazione: 7, distanza: 2 }, { id_allegato: 9, id_segnalazione: 12, distanza: 4 }] });
    assert.equal(r.esito, 'DA_REVISIONARE');
    assert.equal(r.risultato.duplicati.id_segnalazione_precedente, 7);
    assert.deepEqual(r.risultato.duplicati.segnalazioni, [7, 12]);
    assert.deepEqual(r.risultato.motivi_esito, ['FOTO_GIA_USATA']);
  });

  test('immagine uniforme (senza pHash): confronto "non verificabile"', () => {
    assert.equal(verifica({ allegato: allegato({ hash_percettivo: null }) }).risultato.duplicati.stato, 'NON_VERIFICABILE');
  });

  test('segnale del modello: peso basso, da solo non cambia l’esito', () => {
    const r = verifica({ pertinenza: pertinenzaSospetta() });
    assert.equal(r.esito, 'OK');
    assert.equal(r.risultato.segnale_modello.stato, 'SOSPETTO');
    assert.ok(r.punteggio > 0 && r.punteggio < 0.2);
    assert.equal(verifica().risultato.segnale_modello.stato, 'NON_DISPONIBILE');
  });

  test('segnale del modello insieme a un indizio concreto: compare tra i motivi', () => {
    const r = verifica({
      allegato: allegato({ latitudine_exif: CASTELLO[0], longitudine_exif: CASTELLO[1] }),
      pertinenza: pertinenzaSospetta(),
    });
    assert.deepEqual(r.risultato.motivi_esito, ['EXIF_POSIZIONE_LONTANA', 'SEGNALE_MODELLO']);
  });

  test('nessuna combinazione produce BLOCCATO', () => {
    for (const lontano of [false, true]) {
      for (const duplicato of [false, true]) {
        for (const p of [null, pertinenzaSospetta(1)]) {
          const r = verifica({
            allegato: allegato(lontano ? { latitudine_exif: CASTELLO[0], longitudine_exif: CASTELLO[1] } : {}),
            simili: duplicato ? [{ id_allegato: 1, id_segnalazione: 2, distanza: 0 }] : [],
            pertinenza: p,
          });
          assert.notEqual(r.esito, 'BLOCCATO');
          assert.ok(r.punteggio <= 1);
        }
      }
    }
  });
});

describe('Hash percettivo', () => {
  test('16 cifre esadecimali; stessa foto ridimensionata e ricompressa → vicina', async () => {
    const originale = await immagineConTrama(1);
    const ritoccata = await ricomprimi(originale);
    const [a, b] = await Promise.all([hashPercettivo(originale), hashPercettivo(ritoccata)]);
    assert.match(a, /^[0-9a-f]{16}$/);
    assert.ok(distanzaHamming(a, b) <= DISTANZA_MASSIMA, `distanza ${distanzaHamming(a, b)}`);
  });

  test('foto diverse → lontane', async () => {
    const [a, b] = await Promise.all([hashPercettivo(await immagineConTrama(1)), hashPercettivo(await immagineConTrama(4))]);
    assert.ok(distanzaHamming(a, b) > DISTANZA_MASSIMA, `distanza ${distanzaHamming(a, b)}`);
  });

  test('immagine uniforme → nessun hash', async () => {
    assert.equal(await hashPercettivo(await jpeg()), null);
  });
});

describe('Verifica di autenticità nel worker', () => {
  let agAutore, agMod, agAltro;
  before(async () => {
    await avvia();
    agAutore = await accedi(await creaUtente());
    agAltro = await accedi(await creaUtente());
    agMod = await accedi(await creaUtente('MODERATORE'));
  });
  after(() => chiudi());

  const autenticitaDi = async (id) => {
    const { body } = await agMod.get(`/api/v1/moderazione/segnalazioni/${id}/analisi`);
    return body.dati.filter((a) => a.tipo_analisi === 'VERIFICA_AUTENTICITA');
  };
  const invia = async (agente, dati, files) => {
    const res = await inviaSegnalazione(agente, { categorie: [7], ...dati }, files);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.segnalazione.id_segnalazione;
  };

  test('posizione GPS della foto lontana da quella indicata → DA_REVISIONARE', async () => {
    const id = await invia(agAutore, { latitudine: DUOMO[0], longitudine: DUOMO[1] }, [
      { buffer: await jpeg({ gps: CASTELLO }), nome: 'foto.jpg' },
    ]);
    await svuotaCoda();
    const [a] = await autenticitaDi(id);
    assert.equal(a.modello, 'verifica-autenticita@1');
    assert.equal(a.esito, 'DA_REVISIONARE');
    assert.equal(a.risultato.exif.stato, 'INCOERENTE');
  });

  test('foto senza metadati: non verificabile, esito OK', async () => {
    const id = await invia(agAutore, { latitudine: DUOMO[0], longitudine: DUOMO[1] }, [{ buffer: await immagineConTrama(2), nome: 'a.jpg' }]);
    await svuotaCoda();
    const [a] = await autenticitaDi(id);
    assert.equal(a.esito, 'OK');
    assert.equal(a.risultato.exif.stato, 'NON_VERIFICABILE');
    assert.equal(a.risultato.duplicati.stato, 'NESSUNO');
  });

  test('la stessa foto (ricompressa) in un’altra segnalazione → DA_REVISIONARE con l’id della precedente', async () => {
    const foto = await immagineConTrama(3);
    const prima = await invia(agAutore, {}, [{ buffer: foto, nome: 'buca.jpg' }]);
    const ricompressa = await ricomprimi(foto);
    const seconda = await invia(agAltro, {}, [{ buffer: ricompressa, nome: 'buca2.jpg' }]);
    await svuotaCoda();
    const [a] = await autenticitaDi(seconda);
    assert.equal(a.esito, 'DA_REVISIONARE');
    assert.equal(a.risultato.duplicati.id_segnalazione_precedente, prima);
    assert.deepEqual(a.risultato.motivi_esito, ['FOTO_GIA_USATA']);
  });

  test('pannello del comitato: riepilogo, flag nella lista anche per analisi degli allegati, correzione', async () => {
    const id = await invia(agAutore, { latitudine: DUOMO[0], longitudine: DUOMO[1] }, [
      { buffer: await jpeg({ gps: CASTELLO }), nome: 'lontana.jpg' },
    ]);
    await svuotaCoda();
    const { body } = await agMod.get(`/api/v1/moderazione/segnalazioni/${id}/analisi`);
    assert.equal(body.riepilogo.esito, 'DA_REVISIONARE');
    assert.ok(body.riepilogo.motivi.includes('EXIF_POSIZIONE_LONTANA'));
    assert.equal(body.riepilogo.analisi_in_corso, 0);
    // L'unica analisi da revisionare è sull'allegato: la segnalazione compare comunque come "da revisionare".
    assert.ok(body.dati.filter((a) => a.esito !== 'OK').every((a) => a.id_allegato !== null));
    const coda = await agMod.get('/api/v1/moderazione/segnalazioni');
    assert.equal(coda.body.dati.find((x) => x.id_segnalazione === id).da_revisionare_ia, true);

    const autenticita = body.dati.find((a) => a.tipo_analisi === 'VERIFICA_AUTENTICITA');
    const corretta = await agMod.patch(`/api/v1/moderazione/analisi/${autenticita.id_analisi}`).send({ esito_revisione: 'CORRETTA' });
    assert.equal(corretta.status, 200);
    assert.equal(corretta.body.dati.find((a) => a.id_analisi === autenticita.id_analisi).esito_revisione, 'CORRETTA');
    assert.ok(!corretta.body.riepilogo.motivi.includes('EXIF_POSIZIONE_LONTANA'));
    assert.equal(corretta.body.riepilogo.da_revisionare, 0);
    const dopo = await agMod.get('/api/v1/moderazione/segnalazioni');
    assert.equal(dopo.body.dati.find((x) => x.id_segnalazione === id).da_revisionare_ia, false);
  });

  test('riepilogo con analisi ancora in coda: mai OK', async () => {
    const id = await invia(agAutore, {}, [{ buffer: await immagineConTrama(6), nome: 'in-coda.jpg' }]);
    const { body } = await agMod.get(`/api/v1/moderazione/segnalazioni/${id}/analisi`);
    assert.ok(body.riepilogo.analisi_in_corso > 0);
    assert.equal(body.riepilogo.esito, 'DA_REVISIONARE');
    assert.ok(body.riepilogo.motivi.includes('ANALISI_IN_CORSO'));
    await svuotaCoda();
  });

  test('data di scatto e hash salvati all’upload; la data di scatto la vede solo il comitato', async () => {
    const foto = await immagineConTrama(5, { exif: { IFD2: { DateTimeOriginal: '2026:05:01 10:30:00' } } });
    const id = await invia(agAutore, {}, [{ buffer: foto, nome: 'datata.jpg' }]);
    const [[riga]] = await pool.query('SELECT hash_percettivo, data_scatto_exif FROM allegato WHERE id_segnalazione = ?', [id]);
    assert.match(riga.hash_percettivo, /^[0-9a-f]{16}$/);
    assert.ok(riga.data_scatto_exif instanceof Date);

    const perComitato = await agMod.get(`/api/v1/segnalazioni/${id}`);
    assert.ok(perComitato.body.segnalazione.allegati[0].data_scatto_exif);
    // L'autore vede la propria segnalazione, ma non i metadati riservati al comitato.
    const perAutore = await agAutore.get(`/api/v1/segnalazioni/${id}`);
    assert.equal(perAutore.status, 200);
    assert.ok(!('data_scatto_exif' in perAutore.body.segnalazione.allegati[0]));
  });
});
