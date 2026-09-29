import { api } from '../api.js';
import * as catalogo from '../catalogo.js';
import { $, aggiornaUrl, avviso, h, monta, opzioni, parametriUrl, plurale } from '../dom.js';
import { initPage } from '../layout.js';
import { coloreStato, creaMappa, marcatore } from '../mappa.js';

const form = $('#filtri');
let mappa;
let livello;

function popup(s) {
  return h(
    'div',
    {},
    h('a', { href: `/segnalazione?id=${s.id_segnalazione}` }, s.titolo),
    h('div', { class: 'small' }, `${s.quartiere} · ${s.stato.nome} · ${plurale(s.numero_sostegni, 'sostegno', 'sostegni')}`),
  );
}

async function carica() {
  const filtri = Object.fromEntries(new FormData(form));
  aggiornaUrl(filtri);
  try {
    const { dati } = await api.get('/segnalazioni/mappa', filtri);
    livello.clearLayers();
    const punti = dati.map((s) => {
      marcatore([s.latitudine, s.longitudine], s.stato.codice).bindPopup(popup(s)).addTo(livello);
      return [s.latitudine, s.longitudine];
    });
    if (punti.length) mappa.fitBounds(punti, { padding: [30, 30], maxZoom: 15 });
    $('#conteggio').textContent = plurale(dati.length, 'segnalazione sulla mappa', 'segnalazioni sulla mappa');
    monta(
      $('#elenco-punti'),
      dati.map((s) => h('li', {}, h('a', { href: `/segnalazione?id=${s.id_segnalazione}` }, s.titolo), ` — ${s.quartiere}, ${s.stato.nome}`)),
    );
  } catch (err) {
    monta($('#conteggio'), avviso('error', err.message));
  }
}

async function main() {
  await initPage({ attiva: '/mappa' });
  const filtri = parametriUrl();
  const [quartieri, categorie, stati] = await Promise.all([catalogo.quartieri(), catalogo.categorie(), catalogo.statiPubblici()]);
  opzioni($('#quartiere'), quartieri, { valore: 'id_quartiere', etichetta: 'nome', vuota: 'Tutti i quartieri', selezionato: filtri.quartiere });
  opzioni($('#categoria'), categorie, { valore: 'id_categoria', etichetta: 'nome', vuota: 'Tutte le categorie', selezionato: filtri.categoria });
  opzioni($('#stato'), stati, { valore: 'codice', etichetta: 'nome', vuota: 'Tutti gli stati', selezionato: filtri.stato });

  monta(
    $('#legenda'),
    stati.map((s) => {
      const punto = h('span', { class: 'badge' }, '● ', s.nome);
      punto.style.color = coloreStato(s.codice);
      return punto;
    }),
  );

  mappa = creaMappa($('#mappa'));
  livello = window.L.layerGroup().addTo(mappa);
  form.addEventListener('change', carica);
  carica();
}

main();
