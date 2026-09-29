import { api } from '../api.js';
import * as catalogo from '../catalogo.js';
import { cardSegnalazione } from '../components/card.js';
import { $, aggiornaUrl, avviso, caricamento, h, monta, opzioni, paginazione, parametriUrl, plurale, statoVuoto } from '../dom.js';
import { initPage } from '../layout.js';

const form = $('#filtri');
let filtri = { stato: 'INSERITA', pagina: 1, ...parametriUrl() };

async function carica() {
  const elenco = $('#elenco');
  monta(elenco, caricamento());
  monta($('#paginazione'));
  try {
    const { dati, paginazione: pag } = await api.get('/moderazione/segnalazioni', filtri);
    $('#conteggio').textContent = plurale(pag.totale, 'segnalazione', 'segnalazioni');
    if (!dati.length) {
      monta(elenco, statoVuoto('✅', 'Niente da fare qui', 'Non ci sono segnalazioni con questi filtri.'));
      return;
    }
    monta(elenco, h('ul', { class: 'griglia' }, dati.map((s) => h('li', {}, cardSegnalazione(s, { mostraBadgeIa: true })))));
    monta(
      $('#paginazione'),
      paginazione(pag, (p) => {
        filtri.pagina = p;
        aggiornaUrl(filtri);
        carica();
      }),
    );
  } catch (err) {
    monta(elenco, avviso('error', err.message));
  }
}

function applica() {
  filtri = { ...Object.fromEntries(new FormData(form)), pagina: 1 };
  aggiornaUrl(filtri);
  carica();
}

async function main() {
  await initPage({ attiva: '/moderazione', ruoli: ['MODERATORE', 'AMMINISTRATORE'] });
  const [stati, quartieri] = await Promise.all([catalogo.stati(), catalogo.quartieri()]);
  opzioni($('#stato'), stati, { valore: 'codice', etichetta: 'nome', vuota: 'Tutti gli stati', selezionato: filtri.stato });
  opzioni($('#quartiere'), quartieri, { valore: 'id_quartiere', etichetta: 'nome', vuota: 'Tutti i quartieri', selezionato: filtri.quartiere });
  $('#ordina').value = filtri.ordina ?? 'meno_recenti';
  $('#q').value = filtri.q ?? '';
  form.addEventListener('change', applica);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    applica();
  });
  carica();
}

main();
