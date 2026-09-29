import { api } from '../api.js';
import * as catalogo from '../catalogo.js';
import { $, aggiornaUrl, avviso, badgeStato, h, monta, opzioni, parametriUrl, plurale, statoVuoto } from '../dom.js';
import { initPage } from '../layout.js';

const form = $('#filtri');

async function carica() {
  const filtri = Object.fromEntries(new FormData(form));
  aggiornaUrl(filtri);
  const lista = $('#classifica');
  lista.setAttribute('aria-busy', 'true');
  try {
    const { dati } = await api.get('/classifica', { ...filtri, limite: 50 });
    if (!dati.length) {
      monta(lista, h('li', { class: 'vuoto' }, statoVuoto('🏆', 'Ancora nessuna priorità', 'Non ci sono segnalazioni pubblicate con questi filtri.')));
      return;
    }
    const massimo = Math.max(1, ...dati.map((s) => s.numero_sostegni));
    monta(
      lista,
      dati.map((s, i) => {
        const barra = h('div', {});
        barra.style.width = `${(s.numero_sostegni / massimo) * 100}%`;
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
      }),
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
  opzioni($('#quartiere'), quartieri, { valore: 'id_quartiere', etichetta: 'nome', vuota: 'Tutti i quartieri', selezionato: filtri.quartiere });
  opzioni($('#categoria'), categorie, { valore: 'id_categoria', etichetta: 'nome', vuota: 'Tutte le categorie', selezionato: filtri.categoria });
  form.addEventListener('change', carica);
  carica();
}

main();
