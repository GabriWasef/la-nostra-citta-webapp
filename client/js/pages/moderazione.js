import { api } from '../api.js';
import * as catalogo from '../catalogo.js';
import { cardSegnalazione } from '../components/card.js';
import { $, aggiornaUrl, avviso, caricamento, formatDataOra, h, monta, opzioni, paginazione, parametriUrl, plurale, statoVuoto } from '../dom.js';
import { badgeEsito, motivo, motivoAutoIa, percentuale } from '../ia.js';
import { quartiereConRicerca } from '../components/ricerca.js';
import { initPage } from '../layout.js';

const form = $('#filtri');
// Per impostazione predefinita si vedono tutte le segnalazioni, di ogni stato; il filtro "Stato" restringe.
let filtri = { pagina: 1, ...parametriUrl() };

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

// ---------- Sezioni della moderazione automatica ----------

/** Esegue un'azione del comitato su una segnalazione e ricarica le sezioni e l'elenco. */
async function azione(bottone, esito, fn) {
  const riga = bottone.closest('li');
  riga.querySelectorAll('button').forEach((b) => (b.disabled = true));
  try {
    await fn();
    monta($('#messaggio-ia'), avviso('success', esito));
    await Promise.all([caricaSezioni(), carica()]);
  } catch (err) {
    riga.querySelectorAll('button').forEach((b) => (b.disabled = false));
    riga.append(avviso('error', err.message));
  }
}

/** Giudizio del modello sul testo: motivo, confidenza e spiegazione, prima dei pulsanti. */
function giudizioModello(m) {
  if (!m) return h('p', { class: 'small muted' }, 'Nessuna analisi del modello linguistico disponibile.');
  return [
    m.motivo
      ? h('p', { class: 'small' }, h('strong', {}, 'Motivo IA: '), motivo(m.motivo), m.confidenza !== null ? ` · confidenza ${percentuale(m.confidenza)}` : '')
      : null,
    m.spiegazione ? h('p', { class: 'spiegazione-ia' }, h('strong', {}, 'Spiegazione del modello: '), m.spiegazione) : null,
    h('p', { class: 'small muted' }, `Modello: ${m.modello}`),
  ];
}

function intestazione(s, data) {
  return [
    h('div', {}, h('a', { href: `/segnalazione?id=${s.id_segnalazione}` }, h('strong', {}, s.titolo)), ' ', s.ia?.esito ? badgeEsito(s.ia.esito, 'IA: ') : null),
    h('div', { class: 'small muted' }, `${s.quartiere.nome} · ${data}`),
  ];
}

function schedaNascosta(s) {
  const base = `/moderazione/segnalazioni/${s.id_segnalazione}`;
  return h(
    'li',
    {},
    intestazione(s, `nascosta il ${formatDataOra(s.data_nascondimento ?? s.data_inserimento)}`),
    h('p', { class: 'small' }, h('strong', {}, 'Nascosta per: '), motivoAutoIa(s.motivo_nascondimento)),
    giudizioModello(s.ia?.moderazione),
    h(
      'div',
      { class: 'form-actions' },
      h('button', {
        type: 'button',
        class: 'btn btn-small btn-primary',
        title: 'La segnalazione torna visibile; il giudizio del modello risulta respinto',
        on: { click: (e) => azione(e.currentTarget, 'Segnalazione ripristinata.', () => api.post(`${base}/mostra`)) },
      }, 'Ripristina'),
      h('button', {
        type: 'button',
        class: 'btn btn-small',
        title: 'La segnalazione resta nascosta; il giudizio del modello risulta confermato',
        on: { click: (e) => azione(e.currentTarget, 'Confermato: resta nascosta.', () => api.post(`${base}/conferma-nascosta`)) },
      }, 'Conferma nascosta'),
      h('a', { class: 'btn btn-small', href: `/segnalazione?id=${s.id_segnalazione}` }, 'Apri'),
    ),
  );
}

function schedaDaRevisionare(s) {
  const suggerite = s.ia?.categorie_suggerite ?? [];
  const attuali = new Set(s.categorie.map((c) => c.id_categoria));
  const giaApplicate = suggerite.length && suggerite.every((c) => attuali.has(c.id_categoria)) && attuali.size === suggerite.length;
  return h(
    'li',
    {},
    intestazione(s, `inserita il ${formatDataOra(s.data_inserimento)}`),
    s.ia?.motivi?.length ? h('p', { class: 'small' }, h('strong', {}, 'Da verificare: '), s.ia.motivi.map(motivo).join('; '), '.') : null,
    giudizioModello(s.ia?.moderazione),
    suggerite.length
      ? h(
          'div',
          { class: 'small' },
          h('strong', {}, 'Categorie suggerite: '),
          h('ul', { class: 'chips' }, suggerite.map((c) => h('li', { class: 'chip' }, c.nome, h('small', {}, ` · ${percentuale(c.affidabilita)}`)))),
          s.categorie.length ? h('div', { class: 'muted' }, `Scelte ora: ${s.categorie.map((c) => c.nome).join(', ')}`) : null,
        )
      : null,
    h(
      'div',
      { class: 'form-actions' },
      suggerite.length && !giaApplicate
        ? h('button', {
            type: 'button',
            class: 'btn btn-small btn-primary',
            title: 'Sostituisce le categorie della segnalazione con quelle suggerite',
            on: {
              click: (e) =>
                azione(e.currentTarget, 'Categorie suggerite applicate.', () =>
                  api.put(`/moderazione/segnalazioni/${s.id_segnalazione}/categorie`, { categorie: suggerite.map((c) => c.id_categoria) })),
            },
          }, 'Applica le categorie suggerite')
        : null,
      h('a', { class: 'btn btn-small', href: `/segnalazione?id=${s.id_segnalazione}` }, 'Apri e decidi'),
    ),
  );
}

async function sezione(contenitore, vista, scheda, vuoto) {
  monta(contenitore, caricamento(1));
  try {
    const { dati, paginazione: pag } = await api.get('/moderazione/segnalazioni', { vista, ordina: 'recenti', perPagina: 50 });
    if (!dati.length) {
      monta(contenitore, h('p', { class: 'muted' }, vuoto));
      return;
    }
    monta(
      contenitore,
      h('ul', { class: 'analisi-lista' }, dati.map(scheda)),
      pag.totale > dati.length ? h('p', { class: 'small muted' }, `Mostrate le ${dati.length} più recenti su ${pag.totale}.`) : null,
    );
  } catch (err) {
    monta(contenitore, avviso('error', err.message));
  }
}

function caricaSezioni() {
  return Promise.all([
    sezione($('#nascoste-ia'), 'nascoste_ia', schedaNascosta, 'Nessuna segnalazione nascosta automaticamente da esaminare.'),
    sezione($('#da-revisionare'), 'da_revisionare', schedaDaRevisionare, 'Nessuna analisi automatica da revisionare.'),
  ]);
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
  quartiereConRicerca($('#quartiere'), quartieri, { vuota: 'Tutti i quartieri', selezionato: filtri.quartiere, segnaposto: 'Cerca un quartiere…' });
  $('#ordina').value = filtri.ordina ?? 'meno_recenti';
  $('#q').value = filtri.q ?? '';
  form.addEventListener('change', applica);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    applica();
  });
  caricaSezioni();
  carica();
}

main();
