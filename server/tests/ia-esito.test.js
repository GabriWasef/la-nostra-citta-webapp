// Regole di esito delle analisi IA: funzioni pure, senza database.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import './setup-env.js';
import { esitoClassificazione, esitoModerazione, esitoPertinenza, riepilogo } from '../src/ai/esito.js';

const pertinenza = ({ immagine = {}, autenticita = {}, esito_suggerito = 'OK' } = {}) => ({
  testo: { accettabile: true, gravita: 'nessuna', motivi: [] },
  immagine: {
    corrisponde_al_testo: true,
    corrisponde_alla_categoria: true,
    categoria_suggerita: null,
    inappropriata: false,
    confidenza: 0.9,
    osservato: 'Buca nell’asfalto',
    ...immagine,
  },
  segnale_autenticita: { sembra_generata_o_montata: false, confidenza: 0.1, ...autenticita },
  esito_suggerito,
  spiegazione: '',
});

describe('Regole di esito: moderazione del testo', () => {
  const casi = [
    // accettabile, gravità, esito suggerito → esito atteso
    [true, 'nessuna', 'OK', 'OK'],
    [true, 'bassa', 'OK', 'DA_REVISIONARE'],
    [false, 'bassa', 'DA_REVISIONARE', 'DA_REVISIONARE'],
    // Senza un motivo dell'elenco chiuso la gravità alta non basta per bloccare: decide il comitato.
    [false, 'alta', 'BLOCCATO', 'DA_REVISIONARE'],
    [false, 'alta', 'DA_REVISIONARE', 'DA_REVISIONARE'],
    // Il modello chiede di bloccare senza gravità alta: resta un dubbio, non un blocco.
    [false, 'bassa', 'BLOCCATO', 'DA_REVISIONARE'],
    [true, 'nessuna', 'BLOCCATO', 'DA_REVISIONARE'],
    [true, 'nessuna', 'DA_REVISIONARE', 'DA_REVISIONARE'],
  ];
  for (const [accettabile, gravita, suggerito, atteso] of casi) {
    test(`accettabile=${accettabile}, gravità ${gravita}, suggerito ${suggerito} → ${atteso}`, () => {
      const r = esitoModerazione({ testo: { accettabile, gravita, motivi: [] }, motivo: null, confidenza: 0.9, esito_suggerito: suggerito });
      assert.equal(r.esito, atteso);
      assert.equal(r.motivi.length === 0, atteso === 'OK');
    });
  }
});

describe('Regole di esito: motivo della moderazione automatica', () => {
  const r = (motivo, confidenza, opzioni) =>
    esitoModerazione({ testo: { accettabile: motivo === null, gravita: 'nessuna', motivi: [] }, motivo, confidenza, esito_suggerito: 'OK' }, opzioni);

  for (const motivo of ['MINACCIA', 'ODIO', 'INSULTO_GRAVE', 'CONTENUTO_SESSUALE']) {
    test(`${motivo} → BLOCCATO anche con confidenza bassa`, () => {
      assert.deepEqual(r(motivo, 0.3), { esito: 'BLOCCATO', motivi: [motivo] });
    });
  }
  for (const motivo of ['SPAM_PUBBLICITA', 'NON_SENSATA', 'NON_PERTINENTE']) {
    test(`${motivo}: BLOCCATO da 0,9 in su, altrimenti DA_REVISIONARE`, () => {
      assert.equal(r(motivo, 0.95).esito, 'BLOCCATO');
      assert.equal(r(motivo, 0.9).esito, 'BLOCCATO');
      assert.deepEqual(r(motivo, 0.6), { esito: 'DA_REVISIONARE', motivi: [motivo, 'CONFIDENZA_BASSA'] });
    });
  }
  test('la soglia è configurabile (AI_SOGLIA_AUTO_NASCONDI)', () => {
    assert.equal(r('NON_SENSATA', 0.8, { soglia: 0.75 }).esito, 'BLOCCATO');
    assert.equal(r('NON_SENSATA', 0.95, { soglia: 0.99 }).esito, 'DA_REVISIONARE');
  });
  test('DUBBIO → DA_REVISIONARE, a qualunque confidenza', () => {
    for (const c of [0.1, 0.99]) assert.deepEqual(r('DUBBIO', c), { esito: 'DA_REVISIONARE', motivi: ['DUBBIO'] });
  });
  test('nessun motivo e testo accettabile → OK', () => assert.deepEqual(r(null, 0.95), { esito: 'OK', motivi: [] }));
});

describe('Regole di esito: pertinenza delle immagini', () => {
  const casi = [
    ['tutto coerente, confidenza alta', {}, 'OK', []],
    ['immagine inappropriata', { immagine: { inappropriata: true } }, 'BLOCCATO', ['IMMAGINE_INAPPROPRIATA']],
    ['non corrisponde al testo', { immagine: { corrisponde_al_testo: false } }, 'DA_REVISIONARE', ['IMMAGINE_NON_CORRISPONDE_AL_TESTO']],
    ['non corrisponde alla categoria', { immagine: { corrisponde_alla_categoria: false } }, 'DA_REVISIONARE', ['IMMAGINE_NON_CORRISPONDE_ALLA_CATEGORIA']],
    ['categoria non dichiarata (null)', { immagine: { corrisponde_alla_categoria: null } }, 'OK', []],
    ['pertinenza non valutabile', { immagine: { corrisponde_al_testo: null } }, 'DA_REVISIONARE', ['PERTINENZA_NON_VALUTABILE']],
    ['confidenza bassa', { immagine: { confidenza: 0.4 } }, 'DA_REVISIONARE', ['CONFIDENZA_BASSA']],
    ['sospetto di immagine generata', { autenticita: { sembra_generata_o_montata: true, confidenza: 0.9 } }, 'DA_REVISIONARE', ['SEGNALE_AUTENTICITA']],
    ['sospetto con confidenza trascurabile', { autenticita: { sembra_generata_o_montata: true, confidenza: 0.2 } }, 'OK', []],
    ['il modello suggerisce di bloccare senza motivo', { esito_suggerito: 'BLOCCATO' }, 'DA_REVISIONARE', ['ESITO_SUGGERITO_DAL_MODELLO']],
    [
      'inappropriata e sospetta: blocca per il contenuto, non per il sospetto',
      { immagine: { inappropriata: true }, autenticita: { sembra_generata_o_montata: true, confidenza: 1 } },
      'BLOCCATO',
      ['IMMAGINE_INAPPROPRIATA', 'SEGNALE_AUTENTICITA'],
    ],
  ];
  for (const [nome, opzioni, atteso, motivi] of casi) {
    test(`${nome} → ${atteso}`, () => {
      const r = esitoPertinenza(pertinenza(opzioni));
      assert.equal(r.esito, atteso);
      assert.deepEqual(r.motivi, motivi);
    });
  }

  test('il solo sospetto di falsità non produce mai BLOCCATO', () => {
    for (const confidenza of [0, 0.5, 0.99, 1]) {
      for (const suggerito of ['OK', 'DA_REVISIONARE', 'BLOCCATO']) {
        const r = esitoPertinenza(pertinenza({ autenticita: { sembra_generata_o_montata: true, confidenza }, esito_suggerito: suggerito }));
        assert.notEqual(r.esito, 'BLOCCATO', `confidenza ${confidenza}, suggerito ${suggerito}`);
      }
    }
  });
});

describe('Regole di esito: classificazione', () => {
  const s = [{ id_categoria: 7 }, { id_categoria: 10 }];
  test('cittadino senza categorie → da confermare', () => assert.equal(esitoClassificazione(s, []).esito, 'DA_REVISIONARE'));
  test('prima proposta tra le scelte → OK', () => assert.equal(esitoClassificazione(s, [7]).esito, 'OK'));
  test('proposta diversa dalle scelte → da revisionare', () => {
    assert.deepEqual(esitoClassificazione(s, [3]).motivi, ['CATEGORIA_DIVERSA_DAL_SUGGERIMENTO']);
  });
  test('nessuna proposta → da revisionare', () => assert.equal(esitoClassificazione([], [7]).esito, 'DA_REVISIONARE'));
});

describe('Riepilogo per il comitato', () => {
  const a = (tipo_analisi, esito, extra = {}) => ({ tipo_analisi, esito, risultato: { motivi_esito: [`M_${tipo_analisi}`] }, ...extra });

  test('nessuna analisi e nessun job → nessun esito', () => {
    assert.equal(riepilogo({ analisi: [] }).esito, null);
  });
  test('tutto OK → OK', () => {
    const r = riepilogo({ analisi: [a('MODERAZIONE_TESTO', 'OK'), a('VERIFICA_PERTINENZA', 'OK')], job: [{ stato: 'COMPLETATO' }] });
    assert.deepEqual([r.esito, r.motivi, r.da_revisionare], ['OK', [], 0]);
  });
  test('prevale l’esito più grave', () => {
    const r = riepilogo({ analisi: [a('MODERAZIONE_TESTO', 'BLOCCATO'), a('VERIFICA_PERTINENZA', 'DA_REVISIONARE')] });
    assert.equal(r.esito, 'BLOCCATO');
    assert.equal(r.da_revisionare, 2);
  });
  test('l’autenticità non blocca mai', () => {
    assert.equal(riepilogo({ analisi: [a('VERIFICA_AUTENTICITA', 'BLOCCATO')] }).esito, 'DA_REVISIONARE');
  });
  test('analisi respinte o corrette dal comitato non contano; confermate sì', () => {
    const r = riepilogo({
      analisi: [
        a('MODERAZIONE_TESTO', 'BLOCCATO', { esito_revisione: 'RESPINTA' }),
        a('CLASSIFICAZIONE_TESTO', 'DA_REVISIONARE', { esito_revisione: 'CORRETTA' }),
        a('VERIFICA_PERTINENZA', 'DA_REVISIONARE', { esito_revisione: 'CONFERMATA' }),
      ],
    });
    assert.equal(r.esito, 'DA_REVISIONARE');
    assert.equal(r.da_revisionare, 0);
  });
  test('analisi in corso o non riuscite → mai OK', () => {
    const inCorso = riepilogo({ analisi: [a('MODERAZIONE_TESTO', 'OK')], job: [{ stato: 'IN_CODA' }] });
    assert.equal(inCorso.esito, 'DA_REVISIONARE');
    assert.ok(inCorso.motivi.includes('ANALISI_IN_CORSO'));
    const errore = riepilogo({ analisi: [], job: [{ stato: 'ERRORE' }] });
    assert.equal(errore.esito, 'DA_REVISIONARE');
    assert.ok(errore.motivi.includes('PROVIDER_NON_DISPONIBILE'));
  });
});
