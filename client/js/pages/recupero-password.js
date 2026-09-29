import { api, ApiError } from '../api.js';
import { $, avviso, conInvio, h, monta, mostraErrori, parametriUrl } from '../dom.js';
import { initPage } from '../layout.js';

const contenitore = $('#contenitore');

function formRichiesta() {
  const form = h(
    'form',
    { novalidate: true },
    h('div', { class: 'field' }, h('label', { for: 'email' }, 'E-mail dell’account'), h('input', { type: 'email', id: 'email', name: 'email', required: true, autocomplete: 'email' })),
    h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Invia le istruzioni'),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    conInvio(form, async () => {
      try {
        const r = await api.post('/auth/password/recupero', { email: form.email.value });
        monta(contenitore, h('h1', {}, 'Controlla la posta'), avviso('success', r.messaggio), h('p', {}, h('a', { href: '/login' }, 'Torna all’accesso')));
      } catch (err) {
        mostraErrori(form, err);
      }
    });
  });
  monta(contenitore, h('h1', {}, 'Password dimenticata'), h('p', { class: 'muted' }, 'Indica l’e-mail con cui ti sei registrato: riceverai un link valido per un’ora.'), form);
}

function formReimposta(token) {
  const form = h(
    'form',
    { novalidate: true },
    h('div', { class: 'field' }, h('label', { for: 'password' }, 'Nuova password'), h('input', { type: 'password', id: 'password', name: 'password', required: true, minlength: 10, autocomplete: 'new-password', 'aria-describedby': 'hint-pw' }), h('span', { class: 'hint', id: 'hint-pw' }, 'Almeno 10 caratteri, con una lettera e un numero.')),
    h('div', { class: 'field' }, h('label', { for: 'conferma' }, 'Conferma password'), h('input', { type: 'password', id: 'conferma', name: 'conferma', required: true, autocomplete: 'new-password' })),
    h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Imposta la nuova password'),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (form.password.value !== form.conferma.value) {
      mostraErrori(form, new ApiError(400, 'CONFERMA', 'Controlla i campi evidenziati.', [{ campo: 'conferma', messaggio: 'Le due password non coincidono.' }]));
      return;
    }
    conInvio(form, async () => {
      try {
        const r = await api.post('/auth/password/reimposta', { token, password: form.password.value });
        monta(contenitore, h('h1', {}, 'Password aggiornata'), avviso('success', r.messaggio), h('a', { class: 'btn btn-primary', href: '/login' }, 'Accedi'));
      } catch (err) {
        mostraErrori(form, err);
      }
    });
  });
  monta(contenitore, h('h1', {}, 'Nuova password'), form);
}

async function main() {
  await initPage();
  const { token } = parametriUrl();
  if (token) formReimposta(token);
  else formRichiesta();
}

main();
