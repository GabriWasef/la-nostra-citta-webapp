import { api } from '../api.js';
import { $, conInvio, datiForm, mostraErrori, parametriUrl } from '../dom.js';
import { initPage, ritornoSicuro } from '../layout.js';

const form = $('#form-login');

async function main() {
  const utente = await initPage();
  const destinazione = ritornoSicuro(parametriUrl().ritorno);
  if (utente) {
    window.location.replace(destinazione);
    return;
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    conInvio(form, async () => {
      try {
        await api.post('/auth/login', datiForm(form));
        window.location.href = destinazione;
      } catch (err) {
        mostraErrori(form, err);
      }
    });
  });
}

main();
