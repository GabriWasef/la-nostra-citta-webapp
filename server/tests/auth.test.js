import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { accedi, anonimo, avvia, chiudi, creaUtente, PASSWORD, pool } from './helpers.js';
import request from 'supertest';

let app;
before(async () => {
  app = await avvia();
});
after(chiudi);

const nuovo = (extra = {}) => ({
  nome: 'Giulia',
  cognome: 'Conti',
  email: `giulia${Math.random().toString(36).slice(2)}@test.it`,
  password: 'PasswordSicura1',
  consenso_privacy: true,
  ...extra,
});

describe('Registrazione (RF01)', () => {
  test('crea l’account, apre la sessione e salva solo l’hash Argon2id', async () => {
    const agente = request.agent(app);
    const dati = nuovo({ id_quartiere_residenza: 2 });
    const res = await agente.post('/api/v1/auth/register').send(dati);
    assert.equal(res.status, 201);
    assert.equal(res.body.utente.ruolo, 'CITTADINO');
    assert.equal(res.body.utente.password_hash, undefined);
    const [[riga]] = await pool.query('SELECT password_hash, data_consenso_privacy FROM utente WHERE email = ?', [dati.email]);
    assert.match(riga.password_hash, /^\$argon2id\$/);
    assert.ok(riga.data_consenso_privacy);
    const me = await agente.get('/api/v1/auth/me');
    assert.equal(me.body.utente.email, dati.email);
  });

  test('e-mail duplicata (anche con maiuscole diverse) → 409', async () => {
    const dati = nuovo();
    await anonimo().post('/api/v1/auth/register').send(dati).expect(201);
    const res = await anonimo().post('/api/v1/auth/register').send({ ...dati, email: dati.email.toUpperCase() });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EMAIL_GIA_REGISTRATA');
  });

  test('password debole, dati mancanti e consenso assente → 400 con dettagli per campo', async () => {
    const res = await anonimo().post('/api/v1/auth/register').send({ nome: 'G', email: 'non-email', password: 'corta' });
    assert.equal(res.status, 400);
    const campi = res.body.error.details.map((d) => d.campo);
    for (const c of ['nome', 'cognome', 'email', 'password', 'consenso_privacy']) assert.ok(campi.includes(c), c);
  });

  test('quartiere inesistente → 422', async () => {
    const res = await anonimo().post('/api/v1/auth/register').send(nuovo({ id_quartiere_residenza: 9999 }));
    assert.equal(res.status, 422);
  });
});

describe('Autenticazione (RF02)', () => {
  test('login errato → 401 generico e registrato nel log', async () => {
    const u = await creaUtente();
    const res = await anonimo().post('/api/v1/auth/login').send({ email: u.email, password: 'Sbagliata123' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'CREDENZIALI_NON_VALIDE');
    const inesistente = await anonimo().post('/api/v1/auth/login').send({ email: 'nessuno@test.it', password: 'Sbagliata123' });
    assert.equal(inesistente.body.error.message, res.body.error.message);
    const [[log]] = await pool.query("SELECT COUNT(*) AS n FROM log_operazione WHERE azione = 'LOGIN_FALLITO'");
    assert.ok(log.n >= 2);
  });

  test('cookie di sessione HttpOnly e SameSite; logout invalida la sessione', async () => {
    const u = await creaUtente();
    const agente = request.agent(app);
    const res = await agente.post('/api/v1/auth/login').send({ email: u.email, password: PASSWORD });
    const cookie = res.headers['set-cookie'].join(';');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    await agente.post('/api/v1/auth/logout').expect(204);
    const me = await agente.get('/api/v1/auth/me');
    assert.equal(me.body.utente, null);
  });

  test('account sospeso → 403 al login e sessione esistente revocata', async () => {
    const u = await creaUtente();
    const agente = await accedi(u);
    await pool.query("UPDATE utente SET stato_account = 'SOSPESO' WHERE id_utente = ?", [u.id_utente]);
    const me = await agente.get('/api/v1/auth/me');
    assert.equal(me.body.utente, null);
    const res = await anonimo().post('/api/v1/auth/login').send({ email: u.email, password: PASSWORD });
    assert.equal(res.status, 403);
  });

  test('recupero password: token monouso, sessioni revocate', async () => {
    const u = await creaUtente();
    const vecchia = await accedi(u);
    const r = await anonimo().post('/api/v1/auth/password/recupero').send({ email: u.email });
    assert.equal(r.status, 202);
    const token = r.headers['x-test-token'];
    assert.ok(token);
    const ignoto = await anonimo().post('/api/v1/auth/password/recupero').send({ email: 'ignoto@test.it' });
    assert.equal(ignoto.body.messaggio, r.body.messaggio);

    await anonimo().post('/api/v1/auth/password/reimposta').send({ token, password: 'NuovaPassword9' }).expect(200);
    await anonimo().post('/api/v1/auth/password/reimposta').send({ token, password: 'AltraPassword9' }).expect(400);
    assert.equal((await vecchia.get('/api/v1/auth/me')).body.utente, null);
    await anonimo().post('/api/v1/auth/login').send({ email: u.email, password: 'NuovaPassword9' }).expect(200);
  });

  test('stessa origine del server accettata anche se diversa da APP_ORIGIN (es. 127.0.0.1)', async () => {
    const res = await anonimo()
      .post('/api/v1/auth/login')
      .set('Host', '127.0.0.1:3000')
      .set('Origin', 'http://127.0.0.1:3000')
      .send({ email: 'nessuno@test.it', password: 'Sbagliata123' });
    assert.equal(res.status, 401, 'deve arrivare al controllo delle credenziali, non essere bloccata');
  });

  test('richieste da un’origine non autorizzata → 403', async () => {
    const res = await anonimo().post('/api/v1/auth/login').set('Origin', 'https://sito-malevolo.example').send({ email: 'a@b.it', password: 'x' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'ORIGINE_NON_CONSENTITA');
  });
});

describe('Profilo e privacy', () => {
  test('aggiornamento profilo e cambio password', async () => {
    const u = await creaUtente();
    const agente = await accedi(u);
    const res = await agente.patch('/api/v1/utenti/me').send({ nome: 'Anna', id_quartiere_residenza: 3 });
    assert.equal(res.body.utente.nome, 'Anna');
    assert.equal(res.body.utente.id_quartiere_residenza, 3);
    const errata = await agente.put('/api/v1/utenti/me/password').send({ password_attuale: 'Sbagliata1', nuova_password: 'NuovaPassword1' });
    assert.equal(errata.status, 400);
    await agente.put('/api/v1/utenti/me/password').send({ password_attuale: PASSWORD, nuova_password: 'NuovaPassword1' }).expect(200);
  });

  test('disattivazione: dati anonimizzati e accesso impossibile', async () => {
    const u = await creaUtente();
    const agente = await accedi(u);
    await agente.delete('/api/v1/utenti/me').send({ password: PASSWORD }).expect(204);
    const [[riga]] = await pool.query('SELECT nome, email, stato_account FROM utente WHERE id_utente = ?', [u.id_utente]);
    assert.equal(riga.stato_account, 'ELIMINATO');
    assert.equal(riga.nome, 'Utente');
    assert.notEqual(riga.email, u.email);
    await anonimo().post('/api/v1/auth/login').send({ email: u.email, password: PASSWORD }).expect(401);
  });
});
