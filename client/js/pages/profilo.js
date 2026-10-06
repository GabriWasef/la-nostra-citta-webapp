import { api } from '../api.js';
import * as catalogo from '../catalogo.js';
import { cardSegnalazione } from '../components/card.js';
import { $, avviso, caricamento, conInvio, formatData, h, monta, mostraErrori, opzioni, paginazione, parametriUrl, pulisciErrori, statoVuoto } from '../dom.js';
import { quartiereConRicerca } from '../components/ricerca.js';
import { initPage } from '../layout.js';

const RUOLI = { CITTADINO: 'Cittadino', MODERATORE: 'Moderatore del comitato', AMMINISTRATORE: 'Amministratore' };

function conferma(form, testo) {
  pulisciErrori(form);
  const a = avviso('success', testo);
  a.classList.add('form-alert');
  form.prepend(a);
}

async function caricaMie(pagina = 1) {
  const contenitore = $('#mie');
  monta(contenitore, caricamento(2));
  try {
    const { dati, paginazione: pag } = await api.get('/segnalazioni/mie', { pagina, perPagina: 6 });
    if (!dati.length) {
      monta(contenitore, statoVuoto('📝', 'Nessuna segnalazione', 'Non hai ancora inviato segnalazioni.', h('a', { class: 'btn btn-primary', href: '/nuova-segnalazione' }, '+ Fai una segnalazione')));
      monta($('#paginazione'));
      return;
    }
    monta(contenitore, h('ul', { class: 'griglia' }, dati.map((s) => h('li', {}, cardSegnalazione(s)))));
    monta($('#paginazione'), paginazione(pag, caricaMie));
  } catch (err) {
    monta(contenitore, avviso('error', err.message));
  }
}

async function main() {
  const utente = await initPage({ attiva: '/profilo', richiedeAccesso: true });
  if (parametriUrl().benvenuto) {
    $('.page-header').append(avviso('success', `Benvenuto, ${utente.nome}! Il tuo profilo è attivo: ora puoi inviare segnalazioni e sostenere quelle degli altri.`));
  }
  $('#sottotitolo').textContent = `${RUOLI[utente.ruolo]} · iscritto dal ${formatData(utente.data_registrazione)}`;

  const formProfilo = $('#form-profilo');
  $('#p-email').value = utente.email;
  formProfilo.nome.value = utente.nome;
  formProfilo.cognome.value = utente.cognome;
  quartiereConRicerca($('#p-quartiere'), await catalogo.quartieri(), { vuota: 'Non indicato', selezionato: utente.id_quartiere_residenza, segnaposto: 'Cerca il tuo quartiere…' });
  formProfilo.addEventListener('submit', (e) => {
    e.preventDefault();
    conInvio(formProfilo, async () => {
      try {
        await api.patch('/utenti/me', {
          nome: formProfilo.nome.value,
          cognome: formProfilo.cognome.value,
          id_quartiere_residenza: formProfilo.id_quartiere_residenza.value || null,
        });
        conferma(formProfilo, 'Dati aggiornati.');
      } catch (err) {
        mostraErrori(formProfilo, err);
      }
    });
  });

  const formPassword = $('#form-password');
  formPassword.addEventListener('submit', (e) => {
    e.preventDefault();
    conInvio(formPassword, async () => {
      try {
        await api.put('/utenti/me/password', {
          password_attuale: formPassword.password_attuale.value,
          nuova_password: formPassword.nuova_password.value,
        });
        formPassword.reset();
        conferma(formPassword, 'Password aggiornata.');
      } catch (err) {
        mostraErrori(formPassword, err);
      }
    });
  });

  const formElimina = $('#form-elimina');
  formElimina.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!confirm('Vuoi davvero eliminare il tuo account? L’operazione non è reversibile.')) return;
    conInvio(formElimina, async () => {
      try {
        await api.del('/utenti/me', { password: formElimina.password.value });
        window.location.href = '/';
      } catch (err) {
        mostraErrori(formElimina, err);
      }
    });
  });

  caricaMie();
}

main();
