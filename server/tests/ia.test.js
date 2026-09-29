import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import './setup-env.js';
import { classificaTesto } from '../src/ai/classificazione.js';
import { analizzaTesto } from '../src/ai/moderazione.js';

const CATEGORIE = [
  { id_categoria: 6, nome: 'Illuminazione' },
  { id_categoria: 7, nome: 'Manutenzione stradale' },
  { id_categoria: 10, nome: 'Rischio idrogeologico' },
];

describe('Moderazione del testo (regole)', () => {
  test('testo civile → OK', () => {
    assert.equal(analizzaTesto('Il parco è poco curato, servono più cestini.').esito, 'OK');
  });
  test('insulti → da revisionare', () => {
    const r = analizzaTesto('Siete degli incompetenti e degli idioti');
    assert.equal(r.esito, 'DA_REVISIONARE');
    assert.ok(r.motivi.includes('INSULTI'));
  });
  test('minacce → bloccato', () => {
    assert.equal(analizzaTesto('Se lo becco lo ammazzo').esito, 'BLOCCATO');
  });
  test('non confonde parole che contengono termini volgari', () => {
    assert.equal(analizzaTesto('Il merdaio... no: il mercato di via Benedetto Marcello').esito, 'OK');
  });
  test('spam: troppi link', () => {
    assert.ok(analizzaTesto('http://a.it http://b.it http://c.it offerta').motivi.includes('SPAM'));
  });
});

describe('Classificazione tematica (regole)', () => {
  test('propone categorie con affidabilità tra 0 e 1', () => {
    const r = classificaTesto('Buca enorme sull’asfalto e tombino rotto, con la pioggia la strada si allaga', CATEGORIE);
    assert.equal(r[0].nome, 'Manutenzione stradale');
    assert.ok(r.some((c) => c.nome === 'Rischio idrogeologico'));
    for (const c of r) assert.ok(c.affidabilita > 0 && c.affidabilita <= 1);
  });
  test('nessuna corrispondenza → nessuna proposta', () => {
    assert.deepEqual(classificaTesto('Testo generico senza riferimenti', CATEGORIE), []);
  });
});
