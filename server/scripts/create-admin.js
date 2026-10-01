// Crea un amministratore, o promuove a amministratore un utente esistente.
// Uso: npm run admin:create                      (chiede e-mail, nome, cognome e password)
//      node --env-file=.env server/scripts/create-admin.js --email a@b.it --nome Mario --cognome Rossi
// Le opzioni sono facoltative: quelle mancanti vengono chieste da terminale.
// In PowerShell "npm run admin:create -- --email ..." può perdere le opzioni:
// conviene lanciarlo senza opzioni e rispondere alle domande.
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { closePool } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import * as utenti from '../src/repositories/utente.repository.js';
import { hashPassword } from '../src/services/auth.service.js';
import { email as schemaEmail, nomePersona, password as schemaPassword } from '../src/validators/common.js';

/** Domande da terminale; le risposte segrete non vengono mostrate mentre si scrivono. */
function terminale() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
  let muto = false;
  const scrivi = rl._writeToOutput.bind(rl);
  rl._writeToOutput = (testo) => {
    if (!muto) scrivi(testo);
  };
  const righe = rl[Symbol.asyncIterator]();

  return {
    async chiedi(domanda, { segreta = false } = {}) {
      rl.setPrompt(domanda);
      rl.prompt();
      muto = segreta;
      const { value, done } = await righe.next();
      muto = false;
      if (segreta) process.stdout.write('\n');
      if (done) throw new Error('Inserimento interrotto.');
      return value.trim();
    },
    chiudi: () => rl.close(),
  };
}

/** Ripete la domanda finché la risposta non è valida. */
async function chiediValido(t, domanda, schema, opzioni) {
  for (;;) {
    const risultato = schema.safeParse(await t.chiedi(domanda, opzioni));
    if (risultato.success) return risultato.data;
    console.log(`  ${risultato.error.issues.map((i) => i.message).join(' ')}`);
  }
}

async function main() {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, nome: { type: 'string' }, cognome: { type: 'string' } },
  });
  const t = terminale();
  try {
    const email = values.email ? schemaEmail.parse(values.email) : await chiediValido(t, 'E-mail: ', schemaEmail);

    const esistente = await utenti.findCredenzialiByEmail(email);
    if (esistente) {
      await utenti.updateRuoloStato(esistente.id_utente, { ruolo: 'AMMINISTRATORE', stato_account: 'ATTIVO' });
      console.log(`L'utente ${email} esisteva già: ora è AMMINISTRATORE.`);
      return;
    }

    const nome = values.nome ? nomePersona('Il nome').parse(values.nome) : await chiediValido(t, 'Nome: ', nomePersona('Il nome'));
    const cognome = values.cognome
      ? nomePersona('Il cognome').parse(values.cognome)
      : await chiediValido(t, 'Cognome: ', nomePersona('Il cognome'));

    let password = process.env.ADMIN_PASSWORD ? schemaPassword.parse(process.env.ADMIN_PASSWORD) : null;
    while (!password) {
      const prima = await chiediValido(t, 'Password (almeno 10 caratteri, lettere e numeri; non viene mostrata): ', schemaPassword, { segreta: true });
      if ((await t.chiedi('Ripeti la password: ', { segreta: true })) === prima) password = prima;
      else console.log('  Le due password non coincidono, riprova.');
    }

    await utenti.create({ nome, cognome, email, passwordHash: await hashPassword(password), ruolo: 'AMMINISTRATORE' });
    console.log(`Amministratore ${email} creato. Ora puoi accedere da ${env.APP_ORIGIN}/login`);
  } finally {
    t.chiudi();
  }
}

main()
  .catch((err) => {
    console.error(err.issues ? err.issues.map((i) => i.message).join('\n') : err.message);
    process.exitCode = 1;
  })
  .finally(() => closePool());
