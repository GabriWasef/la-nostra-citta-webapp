// Crea un amministratore, o promuove un utente esistente.
// Uso: npm run admin:create -- --email nome@dominio.it --nome Mario --cognome Rossi
// La password viene letta da ADMIN_PASSWORD oppure chiesta da terminale (senza eco).
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { closePool } from '../src/config/db.js';
import * as utenti from '../src/repositories/utente.repository.js';
import { hashPassword } from '../src/services/auth.service.js';
import { email as schemaEmail, nomePersona, password as schemaPassword } from '../src/validators/common.js';

function chiediPassword(domanda) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    rl.question(domanda, (risposta) => {
      rl.close();
      process.stdout.write('\n');
      resolve(risposta);
    });
    rl._writeToOutput = (s) => {
      if (s.startsWith(domanda)) rl.output.write(domanda);
    };
  });
}

async function main() {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, nome: { type: 'string' }, cognome: { type: 'string' } },
  });
  const email = schemaEmail.parse(values.email ?? '');

  const esistente = await utenti.findCredenzialiByEmail(email);
  if (esistente) {
    await utenti.updateRuoloStato(esistente.id_utente, { ruolo: 'AMMINISTRATORE', stato_account: 'ATTIVO' });
    console.log(`L'utente ${email} è ora AMMINISTRATORE.`);
    return;
  }

  const nome = nomePersona('Il nome').parse(values.nome ?? '');
  const cognome = nomePersona('Il cognome').parse(values.cognome ?? '');
  const password = schemaPassword.parse(process.env.ADMIN_PASSWORD ?? (await chiediPassword('Password: ')));
  await utenti.create({ nome, cognome, email, passwordHash: await hashPassword(password), ruolo: 'AMMINISTRATORE' });
  console.log(`Amministratore ${email} creato.`);
}

main()
  .catch((err) => {
    console.error(err.issues ? err.issues.map((i) => i.message).join('\n') : err.message);
    process.exitCode = 1;
  })
  .finally(() => closePool());
