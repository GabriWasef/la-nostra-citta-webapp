import { api, ApiError } from '../api.js';
import * as catalogo from '../catalogo.js';
import { $, conInvio, mostraErrori, opzioni } from '../dom.js';
import { initPage } from '../layout.js';

const form = $('#form-registrazione');

async function main() {
  if (await initPage()) {
    window.location.replace('/');
    return;
  }
  opzioni($('#id_quartiere_residenza'), await catalogo.quartieri(), {
    valore: 'id_quartiere',
    etichetta: 'nome',
    vuota: 'Preferisco non indicarlo',
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (form.password.value !== form.conferma.value) {
      mostraErrori(form, new ApiError(400, 'CONFERMA', 'Controlla i campi evidenziati.', [{ campo: 'conferma', messaggio: 'Le due password non coincidono.' }]));
      return;
    }
    conInvio(form, async () => {
      try {
        await api.post('/auth/register', {
          nome: form.nome.value,
          cognome: form.cognome.value,
          email: form.email.value,
          password: form.password.value,
          id_quartiere_residenza: form.id_quartiere_residenza.value || null,
          consenso_privacy: form.consenso_privacy.checked,
        });
        window.location.href = '/profilo?benvenuto=1';
      } catch (err) {
        mostraErrori(form, err);
      }
    });
  });
}

main();
