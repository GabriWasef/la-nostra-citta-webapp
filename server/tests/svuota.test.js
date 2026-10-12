import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { accedi, avvia, cambiaStato, chiudi, creaUtente, inviaSegnalazione, pool } from './helpers.js';
import { conteggi, percorsiFile, svuota } from '../scripts/svuota-segnalazioni.js';

before(avvia);
after(chiudi);

const n = async (t) => Number((await pool.query(`SELECT COUNT(*) AS n FROM ${t}`))[0][0].n);

describe('Svuotamento dei contenuti (db:svuota)', () => {
  test('elimina segnalazioni e dati collegati, mantiene utenti, categorie, quartieri e stati', async () => {
    const autore = await creaUtente();
    const mod = await creaUtente('MODERATORE');
    const [agAutore, agMod] = await Promise.all([accedi(autore), accedi(mod)]);
    const res = await inviaSegnalazione(agAutore, { categorie: [7] });
    assert.equal(res.status, 201);
    await cambiaStato(agMod, res.body.segnalazione.id_segnalazione, 'APPROVATA').expect(200);
    await pool.query("INSERT INTO limite_richieste (chiave, conteggio, scadenza) VALUES ('prova', 1, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 1 HOUR))");

    const prima = { utenti: await n('utente'), categorie: await n('categoria'), quartieri: await n('quartiere'), stati: await n('stato_segnalazione'), log: await n('log_operazione') };
    const conta = await conteggi(pool);
    assert.ok(conta.segnalazione >= 1 && conta.allegato >= 1 && conta.storico_stato >= 1);
    assert.equal(conta.log_operazione, undefined, 'il registro non si tocca senza --azzera-log');
    assert.ok((await percorsiFile(pool)).length >= 1);

    const conn = await pool.getConnection();
    try {
      await svuota(conn);
    } finally {
      conn.release();
    }

    for (const t of ['segnalazione', 'allegato', 'segnalazione_categoria', 'sostegno', 'storico_stato', 'analisi_ia', 'job_elaborazione', 'limite_richieste']) {
      assert.equal(await n(t), 0, t);
    }
    assert.deepEqual(
      { utenti: await n('utente'), categorie: await n('categoria'), quartieri: await n('quartiere'), stati: await n('stato_segnalazione'), log: await n('log_operazione') },
      prima,
    );
    // L'accesso degli utenti continua a funzionare e si può creare una nuova segnalazione (numerazione ripartita).
    const nuova = await inviaSegnalazione(agAutore, { categorie: [7] });
    assert.equal(nuova.status, 201);
    assert.equal(nuova.body.segnalazione.id_segnalazione, 1);
  });

  test('con azzeraLog elimina anche il registro delle operazioni', async () => {
    assert.ok(await n('log_operazione') > 0);
    const conn = await pool.getConnection();
    try {
      await svuota(conn, { azzeraLog: true });
    } finally {
      conn.release();
    }
    assert.equal(await n('log_operazione'), 0);
    assert.ok(await n('utente') > 0);
  });
});
