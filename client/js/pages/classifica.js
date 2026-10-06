import { api } from '../api.js';
import * as catalogo from '../catalogo.js';
import { $, aggiornaUrl, avviso, badgeStato, h, monta, opzioni, parametriUrl, plurale, statoVuoto } from '../dom.js';
import { quartiereConRicerca } from '../components/ricerca.js';
import { initPage } from '../layout.js';

const form = $('#filtri');

const PER_PAGINA = 50;
let pagina = 1;
let caricate = [];

function riga(s, i) {
  const barra = h('div', {});
  barra.style.width = `${(s.numero_sostegni / Math.max(1, massimo)) * 100}%`;
  return h(
    'li',
    {},
    h('span', { class: 'posizione', 'aria-label': `Posizione ${i + 1}` }, String(i + 1)),
    h(
      'div',
      {},
      h('a', { href: `/segnalazione?id=${s.id_segnalazione}` }, h('strong', {}, s.titolo)),
      h('div', { class: 'small muted' }, `${s.quartiere} · `, badgeStato({ codice: s.codice_stato, nome: s.stato })),
      h('div', { class: 'barra', 'aria-hidden': 'true' }, barra),
    ),
    h('div', { class: 'voti' }, String(s.numero_sostegni), h('small', {}, plurale(s.numero_sostegni, 'sostegno', 'sostegni').replace(/^\d+ /, ''))),
  );
}

let massimo = 1;

/** Carica una pagina della classifica; con "aggiungi" le nuove righe si mettono dopo quelle già mostrate. */
async function carica({ aggiungi = false } = {}) {
  const filtri = Object.fromEntries(new FormData(form));
  aggiornaUrl(filtri);
  const lista = $('#classifica');
  lista.setAttribute('aria-busy', 'true');
  if (!aggiungi) {
    pagina = 1;
    caricate = [];
  }
  try {
    const { dati, paginazione } = await api.get('/classifica', { ...filtri, limite: PER_PAGINA, pagina });
    caricate = caricate.concat(dati);
    if (!caricate.length) {
      monta(lista, h('li', { class: 'vuoto' }, statoVuoto('🏆', 'Ancora nessuna segnalazione', 'Non ci sono segnalazioni pubblicate con questi filtri.')));
      monta($('#altre'));
      $('#totale').textContent = '';
      return;
    }
    massimo = Math.max(1, ...caricate.map((s) => s.numero_sostegni));
    monta(lista, caricate.map(riga));
    $('#totale').textContent = `${plurale(paginazione.totale, 'segnalazione', 'segnalazioni')}, comprese quelle ancora senza sostegni.`;
    monta(
      $('#altre'),
      pagina < paginazione.pagine
        ? h(
            'button',
            {
              class: 'btn',
              type: 'button',
              on: {
                click: () => {
                  pagina += 1;
                  carica({ aggiungi: true });
                },
              },
            },
            `Mostra altre (${paginazione.totale - caricate.length})`,
          )
        : null,
    );
  } catch (err) {
    monta(lista, h('li', {}, avviso('error', err.message)));
  } finally {
    lista.removeAttribute('aria-busy');
  }
}

async function main() {
  await initPage({ attiva: '/classifica' });
  const filtri = parametriUrl();
  const [quartieri, categorie] = await Promise.all([catalogo.quartieri(), catalogo.categorie()]);
  quartiereConRicerca($('#quartiere'), quartieri, { vuota: 'Tutti i quartieri', selezionato: filtri.quartiere, segnaposto: 'Cerca un quartiere…' });
  opzioni($('#categoria'), categorie, { valore: 'id_categoria', etichetta: 'nome', vuota: 'Tutte le categorie', selezionato: filtri.categoria });
  form.addEventListener('change', () => carica());
  carica();
}

main();
