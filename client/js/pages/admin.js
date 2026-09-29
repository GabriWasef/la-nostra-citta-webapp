import { api } from '../api.js';
import { $, avviso, formatDataOra, h, monta, paginazione } from '../dom.js';
import { getUtente, initPage } from '../layout.js';

const pannello = $('#pannello');
let utenteCorrente;

function messaggio(tipo, testo) {
  monta($('#messaggi'), avviso(tipo, testo));
}

const tabella = (intestazioni, righe) =>
  h('div', { class: 'tabella-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, intestazioni.map((t) => h('th', { scope: 'col' }, t)))), h('tbody', {}, righe)));

const selectDa = (valori, selezionato, attrs) =>
  h('select', attrs, Object.entries(valori).map(([v, t]) => h('option', { value: v, selected: v === selezionato }, t)));

// ---------- Utenti ----------

const RUOLI = { CITTADINO: 'Cittadino', MODERATORE: 'Moderatore', AMMINISTRATORE: 'Amministratore' };
const STATI_ACCOUNT = { ATTIVO: 'Attivo', SOSPESO: 'Sospeso' };

async function sezioneUtenti(pagina = 1, q = '') {
  const { dati, paginazione: pag } = await api.get('/admin/utenti', { pagina, q });
  const ricerca = h(
    'form',
    { class: 'filtri', role: 'search' },
    h('div', { class: 'field field-ricerca' }, h('label', { for: 'cerca-utenti' }, 'Cerca per nome o e-mail'), h('input', { type: 'search', id: 'cerca-utenti', name: 'q', value: q })),
    h('button', { class: 'btn', type: 'submit' }, 'Cerca'),
  );
  ricerca.addEventListener('submit', (e) => {
    e.preventDefault();
    sezioneUtenti(1, ricerca.q.value).catch((err) => messaggio('error', err.message));
  });

  const aggiorna = async (u, campo, valore, select) => {
    if (!confirm(`Confermi la modifica di ${u.nome} ${u.cognome}?`)) {
      select.value = u[campo];
      return;
    }
    try {
      const { utente } = await api.patch(`/admin/utenti/${u.id_utente}`, { [campo]: valore });
      Object.assign(u, utente);
      messaggio('success', `Utente ${u.nome} ${u.cognome} aggiornato.`);
    } catch (err) {
      select.value = u[campo];
      messaggio('error', err.message);
    }
  };

  const righe = dati.map((u) => {
    const sono = u.id_utente === utenteCorrente.id_utente;
    const eliminato = u.stato_account === 'ELIMINATO';
    const selRuolo = selectDa(RUOLI, u.ruolo, { 'aria-label': `Ruolo di ${u.nome} ${u.cognome}`, disabled: sono || eliminato });
    selRuolo.addEventListener('change', () => aggiorna(u, 'ruolo', selRuolo.value, selRuolo));
    const selStato = eliminato
      ? h('span', { class: 'badge' }, 'Eliminato')
      : selectDa(STATI_ACCOUNT, u.stato_account, { 'aria-label': `Stato dell’account di ${u.nome} ${u.cognome}`, disabled: sono });
    if (!eliminato) selStato.addEventListener('change', () => aggiorna(u, 'stato_account', selStato.value, selStato));
    return h('tr', {}, h('td', {}, `${u.nome} ${u.cognome}`, sono ? h('span', { class: 'muted small' }, ' (tu)') : null), h('td', {}, u.email), h('td', {}, selRuolo), h('td', {}, selStato), h('td', {}, String(u.numero_segnalazioni)), h('td', { class: 'small' }, u.data_ultimo_accesso ? formatDataOra(u.data_ultimo_accesso) : '—'));
  });

  monta(
    pannello,
    ricerca,
    tabella(['Nome', 'E-mail', 'Ruolo', 'Account', 'Segnalazioni', 'Ultimo accesso'], righe),
    paginazione(pag, (p) => sezioneUtenti(p, q).catch((err) => messaggio('error', err.message))),
  );
}

// ---------- Quartieri e categorie (stessa interfaccia) ----------

function sezioneCatalogo({ titolo, percorsoLettura, percorsoAdmin, chiaveId, campi }) {
  const ricarica = async () => {
    const { dati } = await api.get(percorsoLettura);

    const campoInput = (c, valore = '', idPrefisso = 'nuovo') =>
      h('input', {
        type: c.tipo ?? 'text',
        name: c.nome,
        id: `${idPrefisso}-${c.nome}`,
        value: valore ?? '',
        required: c.obbligatorio,
        min: c.min,
        max: c.max,
        'aria-label': c.etichetta,
      });

    const salva = async (metodo, url, form) => {
      const corpo = {};
      for (const c of campi) {
        const v = form.elements[c.nome].value.trim();
        corpo[c.nome] = v === '' ? null : c.tipo === 'number' ? Number(v) : v;
      }
      try {
        await api[metodo](url, corpo);
        messaggio('success', 'Modifiche salvate.');
        await ricarica();
      } catch (err) {
        messaggio('error', err.details?.length ? `${err.message} ${err.details.map((d) => d.messaggio).join(' ')}` : err.message);
      }
    };

    const nuovo = h(
      'form',
      { class: 'panel' },
      h('h2', {}, `Nuovo ${titolo}`),
      campi.map((c) => h('div', { class: 'field' }, h('label', { for: `nuovo-${c.nome}` }, c.etichetta, c.obbligatorio ? '' : h('span', { class: 'opzionale' }, ' (facoltativo)')), campoInput(c))),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Aggiungi'),
    );
    nuovo.addEventListener('submit', (e) => {
      e.preventDefault();
      salva('post', percorsoAdmin, nuovo);
    });

    const righe = dati.map((voce) => {
      const form = h('form', { id: `f-${voce[chiaveId]}` });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        salva('patch', `${percorsoAdmin}/${voce[chiaveId]}`, form);
      });
      return h(
        'tr',
        {},
        campi.map((c) => {
          const input = campoInput(c, voce[c.nome], `r${voce[chiaveId]}`);
          input.setAttribute('form', form.id);
          return h('td', {}, input);
        }),
        h('td', {}, String(voce.numero_segnalazioni ?? 0)),
        h(
          'td',
          {},
          form,
          h('div', { class: 'azioni-riga' },
            h('button', { type: 'submit', form: form.id, class: 'btn btn-small' }, 'Salva'),
            h('button', {
              type: 'button',
              class: 'btn btn-small btn-danger',
              on: {
                click: async () => {
                  if (!confirm(`Eliminare "${voce.nome}"?`)) return;
                  try {
                    await api.del(`${percorsoAdmin}/${voce[chiaveId]}`);
                    messaggio('success', `"${voce.nome}" eliminato.`);
                    await ricarica();
                  } catch (err) {
                    messaggio('error', err.message);
                  }
                },
              },
            }, 'Elimina')),
        ),
      );
    });

    monta(pannello, tabella([...campi.map((c) => c.etichetta), 'Segnalazioni', 'Azioni'], righe), nuovo);
  };
  return ricarica;
}

const sezioneQuartieri = sezioneCatalogo({
  titolo: 'quartiere',
  percorsoLettura: '/quartieri',
  percorsoAdmin: '/admin/quartieri',
  chiaveId: 'id_quartiere',
  campi: [
    { nome: 'nome', etichetta: 'Nome', obbligatorio: true },
    { nome: 'descrizione', etichetta: 'Descrizione' },
    { nome: 'municipio', etichetta: 'Municipio', tipo: 'number', min: 1, max: 9 },
  ],
});

const sezioneCategorie = sezioneCatalogo({
  titolo: 'categoria',
  percorsoLettura: '/categorie',
  percorsoAdmin: '/admin/categorie',
  chiaveId: 'id_categoria',
  campi: [
    { nome: 'nome', etichetta: 'Nome', obbligatorio: true },
    { nome: 'descrizione', etichetta: 'Descrizione' },
  ],
});

// ---------- Stati ----------

async function sezioneStati() {
  const { dati } = await api.get('/stati');
  const righe = dati.map((s) => {
    const form = h('form', { id: `stato-${s.id_stato}` });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api.patch(`/admin/stati/${s.id_stato}`, { nome: form.elements.nome.value, descrizione: form.elements.descrizione.value || null });
        messaggio('success', 'Stato aggiornato.');
      } catch (err) {
        messaggio('error', err.message);
      }
    });
    return h(
      'tr',
      {},
      h('td', {}, String(s.ordine)),
      h('td', {}, h('code', {}, s.codice)),
      h('td', {}, h('input', { name: 'nome', value: s.nome, form: form.id, 'aria-label': `Nome dello stato ${s.codice}`, required: true })),
      h('td', {}, h('input', { name: 'descrizione', value: s.descrizione ?? '', form: form.id, 'aria-label': `Descrizione dello stato ${s.codice}` })),
      h('td', { class: 'small' }, s.pubblica ? 'Pubblica' : 'Non pubblica', s.finale ? ' · finale' : ''),
      h('td', {}, form, h('button', { type: 'submit', form: form.id, class: 'btn btn-small' }, 'Salva')),
    );
  });
  monta(
    pannello,
    h('p', { class: 'muted' }, 'I codici e le regole del ciclo di vita sono fissi; nome e descrizione visualizzati sono modificabili.'),
    tabella(['#', 'Codice', 'Nome', 'Descrizione', 'Regole', ''], righe),
  );
}

// ---------- Registro ----------

async function sezioneLog(pagina = 1) {
  const { dati, paginazione: pag } = await api.get('/admin/log', { pagina });
  monta(
    pannello,
    tabella(
      ['Data', 'Utente', 'Azione', 'Oggetto', 'Dettagli', 'IP'],
      dati.map((l) =>
        h('tr', {},
          h('td', { class: 'small' }, formatDataOra(l.data_operazione)),
          h('td', {}, l.utente ?? '—'),
          h('td', {}, h('code', {}, l.azione)),
          h('td', { class: 'small' }, l.entita ? `${l.entita} ${l.id_entita ?? ''}` : '—'),
          h('td', { class: 'small' }, l.dettagli ? JSON.stringify(l.dettagli) : ''),
          h('td', { class: 'small' }, l.indirizzo_ip ?? ''),
        ),
      ),
    ),
    paginazione(pag, (p) => sezioneLog(p).catch((err) => messaggio('error', err.message))),
  );
}

// ---------- Tab ----------

const SEZIONI = [
  ['utenti', 'Utenti', sezioneUtenti],
  ['quartieri', 'Quartieri', sezioneQuartieri],
  ['categorie', 'Categorie', sezioneCategorie],
  ['stati', 'Stati', sezioneStati],
  ['log', 'Registro operazioni', sezioneLog],
];

async function apri(chiave, conFocus = false) {
  for (const b of $('#tabs').children) {
    const attiva = b.dataset.sezione === chiave;
    b.setAttribute('aria-selected', String(attiva));
    b.tabIndex = attiva ? 0 : -1;
    if (attiva) pannello.setAttribute('aria-labelledby', b.id);
  }
  monta($('#messaggi'));
  monta(pannello, h('div', { class: 'scheletro' }));
  history.replaceState(null, '', `#${chiave}`);
  try {
    await SEZIONI.find(([k]) => k === chiave)[2]();
    if (conFocus) pannello.focus();
  } catch (err) {
    monta(pannello, avviso('error', err.message));
  }
}

async function main() {
  await initPage({ attiva: '/admin', ruoli: ['AMMINISTRATORE'] });
  utenteCorrente = await getUtente();
  const tabs = $('#tabs');
  monta(
    tabs,
    SEZIONI.map(([k, t]) => h('button', { type: 'button', role: 'tab', id: `tab-${k}`, 'aria-controls': 'pannello', dataset: { sezione: k }, on: { click: () => apri(k, true) } }, t)),
  );
  // Navigazione da tastiera tra le schede (frecce).
  tabs.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const bottoni = [...tabs.children];
    const i = bottoni.indexOf(document.activeElement);
    const prossimo = bottoni[(i + (e.key === 'ArrowRight' ? 1 : -1) + bottoni.length) % bottoni.length];
    prossimo.focus();
    apri(prossimo.dataset.sezione);
  });
  const iniziale = location.hash.slice(1);
  apri(SEZIONI.some(([k]) => k === iniziale) ? iniziale : 'utenti');
}

main();
