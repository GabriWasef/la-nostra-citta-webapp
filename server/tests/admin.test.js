import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { accedi, avvia, chiudi, creaUtente, inviaSegnalazione } from './helpers.js';

let admin, agAdmin, agCittadino, agMod, cittadino;

before(async () => {
  await avvia();
  admin = await creaUtente('AMMINISTRATORE');
  cittadino = await creaUtente();
  agAdmin = await accedi(admin);
  agCittadino = await accedi(cittadino);
  agMod = await accedi(await creaUtente('MODERATORE'));
});
after(chiudi);

describe('Amministrazione', () => {
  test('solo gli amministratori', async () => {
    await agCittadino.get('/api/v1/admin/utenti').expect(403);
    await agMod.get('/api/v1/admin/utenti').expect(403);
    await agAdmin.get('/api/v1/admin/utenti').expect(200);
  });

  test('promozione a moderatore ha effetto immediato', async () => {
    await agCittadino.get('/api/v1/moderazione/segnalazioni').expect(403);
    const res = await agAdmin.patch(`/api/v1/admin/utenti/${cittadino.id_utente}`).send({ ruolo: 'MODERATORE' });
    assert.equal(res.body.utente.ruolo, 'MODERATORE');
    await agCittadino.get('/api/v1/moderazione/segnalazioni').expect(200);
  });

  test('sospensione revoca le sessioni; l’admin non può modificare se stesso', async () => {
    const u = await creaUtente();
    const ag = await accedi(u);
    await agAdmin.patch(`/api/v1/admin/utenti/${u.id_utente}`).send({ stato_account: 'SOSPESO' }).expect(200);
    assert.equal((await ag.get('/api/v1/auth/me')).body.utente, null);
    await agAdmin.patch(`/api/v1/admin/utenti/${admin.id_utente}`).send({ ruolo: 'CITTADINO' }).expect(403);
  });

  test('quartieri: creazione, nome duplicato, eliminazione di un quartiere in uso', async () => {
    const creato = await agAdmin.post('/api/v1/admin/quartieri').send({ nome: 'Quartiere Esempio', municipio: 3 });
    assert.equal(creato.status, 201);
    const dup = await agAdmin.post('/api/v1/admin/quartieri').send({ nome: 'Quartiere Esempio' });
    assert.equal(dup.status, 409);
    const modificato = await agAdmin.patch(`/api/v1/admin/quartieri/${creato.body.quartiere.id_quartiere}`).send({ descrizione: 'Zona universitaria' });
    assert.equal(modificato.body.quartiere.municipio, 3, 'i campi non inviati restano invariati');

    const agAutore = await accedi(await creaUtente());
    assert.equal((await inviaSegnalazione(agAutore, { id_quartiere: creato.body.quartiere.id_quartiere })).status, 201);
    const inUso = await agAdmin.delete(`/api/v1/admin/quartieri/${creato.body.quartiere.id_quartiere}`);
    assert.equal(inUso.status, 409);
    const libero = await agAdmin.post('/api/v1/admin/quartieri').send({ nome: 'Quartiere di prova' });
    await agAdmin.delete(`/api/v1/admin/quartieri/${libero.body.quartiere.id_quartiere}`).expect(204);
  });

  test('categorie e stati: modifica del nome visualizzato', async () => {
    const cat = await agAdmin.post('/api/v1/admin/categorie').send({ nome: 'Barriere architettoniche' });
    assert.equal(cat.status, 201);
    const stato = await agAdmin.patch('/api/v1/admin/stati/1').send({ nome: 'Ricevuta' });
    assert.equal(stato.body.stato.nome, 'Ricevuta');
    assert.equal(stato.body.stato.codice, 'INSERITA');
  });

  test('registro delle operazioni', async () => {
    const res = await agAdmin.get('/api/v1/admin/log');
    const azioni = res.body.dati.map((l) => l.azione);
    for (const a of ['LOGIN', 'UTENTE_MODIFICATO', 'QUARTIERE_CREATO', 'SEGNALAZIONE_CREATA']) assert.ok(azioni.includes(a), a);
  });
});
