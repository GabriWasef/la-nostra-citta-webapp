import { api } from '../api.js';
import * as catalogo from '../catalogo.js';
import { cardSegnalazione } from '../components/card.js';
import { $, aggiornaUrl, avviso, caricamento, h, monta, opzioni, paginazione, parametriUrl, plurale, statoVuoto } from '../dom.js';
import { initPage } from '../layout.js';

const form = $('#filtri');
let filtri = { pagina: 1, ...parametriUrl() };

async function caricaStatistiche() {
  try {
    const s = await api.get('/statistiche');
    monta(
      $('#statistiche'),
      h('li', {}, h('strong', {}, String(s.segnalazioni_pubblicate)), h('span', {}, 'segnalazioni pubblicate')),
      h('li', {}, h('strong', {}, String(s.sostegni_totali)), h('span', {}, 'sostegni dei cittadini')),
      h('li', {}, h('strong', {}, String(s.quartieri_coinvolti)), h('span', {}, 'quartieri coinvolti')),
    );
  } catch {
    $('#statistiche').remove();
  }
}

async function caricaElenco() {
  const elenco = $('#elenco');
  monta(elenco, caricamento());
  monta($('#paginazione'));
  try {
    const { dati, paginazione: pag } = await api.get('/segnalazioni', filtri);
    $('#conteggio').textContent = plurale(pag.totale, 'segnalazione trovata', 'segnalazioni trovate');
    if (!dati.length) {
      monta(
        elenco,
        statoVuoto('🔎', 'Nessuna segnalazione', 'Prova a cambiare i filtri, oppure segnala tu il primo problema.', h('a', { class: 'btn btn-primary', href: '/nuova-segnalazione' }, '+ Fai una segnalazione')),
      );
      return;
    }
    monta(elenco, h('ul', { class: 'griglia' }, dati.map((s) => h('li', {}, cardSegnalazione(s)))));
    monta(
      $('#paginazione'),
      paginazione(pag, (p) => {
        filtri.pagina = p;
        aggiornaUrl(filtri);
        caricaElenco();
        $('#titolo-elenco').scrollIntoView({ behavior: 'smooth' });
      }),
    );
  } catch (err) {
    monta(elenco, avviso('error', err.message));
  }
}

function applicaFiltri() {
  filtri = { ...Object.fromEntries(new FormData(form)), pagina: 1 };
  aggiornaUrl(filtri);
  caricaElenco();
}

async function main() {
  await initPage({ attiva: '/' });
  const [quartieri, categorie, stati] = await Promise.all([catalogo.quartieri(), catalogo.categorie(), catalogo.statiPubblici()]);
  opzioni($('#quartiere'), quartieri, { valore: 'id_quartiere', etichetta: 'nome', vuota: 'Tutti i quartieri', selezionato: filtri.quartiere });
  opzioni($('#categoria'), categorie, { valore: 'id_categoria', etichetta: 'nome', vuota: 'Tutte le categorie', selezionato: filtri.categoria });
  opzioni($('#stato'), stati, { valore: 'codice', etichetta: 'nome', vuota: 'Tutti gli stati', selezionato: filtri.stato });
  $('#ordina').value = filtri.ordina ?? 'recenti';
  $('#q').value = filtri.q ?? '';

  form.addEventListener('change', applicaFiltri);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    applicaFiltri();
  });
  let attesa;
  $('#q').addEventListener('input', () => {
    clearTimeout(attesa);
    attesa = setTimeout(applicaFiltri, 400);
  });

  caricaStatistiche();
  caricaElenco();
}

main();
