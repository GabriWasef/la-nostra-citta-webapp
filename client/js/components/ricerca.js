// Campi di scelta con ricerca: un elenco a tendina in cui si può scrivere per trovare
// la voce (quartieri) e una scelta multipla con le voci selezionate mostrate come etichette (categorie).
// Il <select> originale resta nel documento (nascosto): i form e il resto del codice
// continuano a leggerne il valore e a ricevere l'evento "change".
import { h, monta, opzioni } from '../dom.js';

let contatore = 0;

/** Minuscolo e senza accenti né apostrofi, per cercare "citta" e trovare "Città". */
const normalizza = (testo) =>
  String(testo)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, ' ')
    .toLowerCase()
    .trim();

const perNome = (a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' });

/** Il quartiere "Navigli" va indicato con il municipio; i comuni dell'hinterland con "Hinterland". */
export const dettaglioQuartiere = (q) => (q.municipio ? `Municipio ${q.municipio}` : q.descrizione?.startsWith('Comune') ? 'Comune dell’area metropolitana' : '');

/**
 * Riempie il <select> con i quartieri in ordine alfabetico e lo trasforma in un campo con ricerca.
 * @param {HTMLSelectElement} select
 * @param {object[]} quartieri come restituiti dall'API
 */
export function quartiereConRicerca(select, quartieri, { vuota, selezionato = null, segnaposto = 'Cerca il quartiere…' } = {}) {
  opzioni(select, [...quartieri].sort(perNome), { valore: 'id_quartiere', etichetta: 'nome', vuota, selezionato });
  [...select.options].forEach((o) => {
    const q = quartieri.find((x) => String(x.id_quartiere) === o.value);
    if (q) o.dataset.dettaglio = dettaglioQuartiere(q);
  });
  return selezionaConRicerca(select, { segnaposto });
}

export function selezionaConRicerca(select, { segnaposto = 'Cerca…', nessunRisultato = 'Nessun risultato. Controlla come hai scritto.' } = {}) {
  const id = `combo-${++contatore}`;
  const etichetta = document.querySelector(`label[for="${select.id}"]`);

  const input = h('input', {
    type: 'text',
    class: 'combo-input',
    id: `${id}-input`,
    role: 'combobox',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    placeholder: segnaposto,
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': `${id}-lista`,
    'aria-describedby': select.getAttribute('aria-describedby'),
  });
  const lista = h('ul', { class: 'combo-lista', id: `${id}-lista`, role: 'listbox', hidden: true });
  if (etichetta) lista.setAttribute('aria-labelledby', etichetta.id || (etichetta.id = `${id}-etichetta`));
  const freccia = h('button', { type: 'button', class: 'combo-freccia', tabindex: '-1', 'aria-label': 'Mostra tutte le voci' }, '▾');
  const contenitore = h('div', { class: 'combo' }, h('div', { class: 'combo-campo' }, input, freccia), lista);

  // Il select resta per i form, ma non si vede e non si raggiunge con la tastiera.
  select.classList.add('combo-nativo');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.after(contenitore);
  if (etichetta) etichetta.htmlFor = input.id;
  // mostraErrori() mette il focus sul campo non valido: lo si porta sul campo visibile.
  select.focus = () => input.focus();

  let voci = [];
  let visibili = [];
  let attiva = -1;

  const aperto = () => !lista.hidden;
  const testoSelezionato = () => select.selectedOptions[0]?.value ? select.selectedOptions[0].textContent : '';

  function leggiVoci() {
    voci = [...select.options].map((o) => ({ valore: o.value, testo: o.textContent, dettaglio: o.dataset.dettaglio ?? '', chiave: normalizza(o.textContent) }));
  }

  function disegna(filtro) {
    const cerca = normalizza(filtro);
    // Quando si apre senza scrivere, si mostrano tutte le voci (ricerca vuota).
    visibili = voci.filter((v) => !cerca || v.chiave.includes(cerca));
    // Prima le voci che iniziano con quanto scritto.
    if (cerca) visibili.sort((a, b) => Number(b.chiave.startsWith(cerca)) - Number(a.chiave.startsWith(cerca)));
    attiva = Math.max(0, visibili.findIndex((v) => v.valore === select.value));
    if (cerca) attiva = 0;
    monta(
      lista,
      visibili.length
        ? visibili.map((v, i) =>
            h(
              'li',
              {
                role: 'option',
                id: `${id}-voce-${i}`,
                class: 'combo-voce',
                'aria-selected': String(v.valore === select.value),
                dataset: { indice: i },
                on: {
                  // mousedown: scatta prima che il campo perda il focus (blur) e chiuda l'elenco
                  mousedown: (e) => {
                    e.preventDefault();
                    scegli(v);
                  },
                },
              },
              h('span', {}, v.testo),
              v.dettaglio ? h('small', {}, v.dettaglio) : null,
            ),
          )
        : h('li', { class: 'combo-vuoto', role: 'presentation' }, nessunRisultato),
    );
    evidenzia();
  }

  function evidenzia() {
    [...lista.querySelectorAll('[role="option"]')].forEach((li, i) => {
      li.classList.toggle('attiva', i === attiva);
      if (i === attiva) {
        input.setAttribute('aria-activedescendant', li.id);
        li.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function apri(filtro = '') {
    leggiVoci();
    disegna(filtro);
    lista.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function chiudi() {
    lista.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    input.value = testoSelezionato(); // se non si è scelto nulla, torna la voce già selezionata
  }

  function scegli(voce) {
    const cambiato = select.value !== voce.valore;
    // la proprietà "value" è ridefinita sotto per aggiornare il testo: qui si usa quella nativa
    descrittore.set.call(select, voce.valore);
    input.value = voce.valore ? voce.testo : '';
    chiudi();
    if (cambiato) select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // L'evento "change" nativo del campo di testo non deve arrivare ai form (li ricaricherebbe a vuoto).
  input.addEventListener('change', (e) => e.stopPropagation());
  input.addEventListener('focus', () => input.select());
  input.addEventListener('click', () => (aperto() ? null : apri('')));
  input.addEventListener('input', () => {
    if (!aperto()) {
      leggiVoci();
      lista.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
    disegna(input.value);
  });
  input.addEventListener('blur', () => {
    // Se si è scritto il nome esatto di una voce senza selezionarla, la si accetta.
    if (aperto()) {
      const esatta = voci.find((v) => v.valore && normalizza(v.testo) === normalizza(input.value));
      if (esatta && esatta.valore !== select.value) return scegli(esatta);
      chiudi();
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!aperto()) return apri('');
      if (!visibili.length) return;
      attiva = (attiva + (e.key === 'ArrowDown' ? 1 : -1) + visibili.length) % visibili.length;
      evidenzia();
    } else if (e.key === 'Home' || e.key === 'End') {
      if (aperto() && visibili.length) {
        e.preventDefault();
        attiva = e.key === 'Home' ? 0 : visibili.length - 1;
        evidenzia();
      }
    } else if (e.key === 'Enter') {
      if (aperto()) {
        e.preventDefault(); // l'invio sceglie la voce, non invia il modulo
        if (visibili[attiva]) scegli(visibili[attiva]);
      }
    } else if (e.key === 'Escape') {
      if (aperto()) {
        e.preventDefault();
        chiudi();
      }
    }
  });
  freccia.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (aperto()) chiudi();
    else {
      input.focus();
      apri('');
    }
  });

  // Quando il codice cambia il valore (es. quartiere impostato dalla mappa), il testo si aggiorna.
  const descrittore = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(select, 'value', {
    configurable: true,
    get() {
      return descrittore.get.call(this);
    },
    set(v) {
      descrittore.set.call(this, v);
      if (!aperto()) input.value = testoSelezionato();
    },
  });
  new MutationObserver(() => {
    if (!aperto()) input.value = testoSelezionato();
  }).observe(select, { childList: true });

  input.value = testoSelezionato();
  return contenitore;
}

/**
 * Scelta multipla di categorie: un pulsante apre l'elenco, le voci scelte compaiono come etichette
 * con la possibilità di toglierle. Le caselle hanno il nome del campo, quindi FormData le legge come prima.
 * @param {HTMLElement} contenitore
 * @param {{id_categoria: number, nome: string, descrizione?: string}[]} categorie
 */
export function sceltaMultipla(contenitore, categorie, { nome = 'categorie', max = 5, etichetta = 'Scegli le categorie' } = {}) {
  const id = `multi-${++contatore}`;
  const caselle = [];
  const elementi = [...categorie].sort(perNome);

  const trigger = h('button', { type: 'button', class: 'multi-trigger', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': `${id}-pannello` });
  const pannello = h('div', { class: 'multi-pannello', id: `${id}-pannello`, role: 'group', 'aria-label': etichetta, hidden: true });
  const scelte = h('ul', { class: 'multi-scelte', 'aria-label': 'Categorie scelte' });
  const limite = h('p', { class: 'multi-limite small muted', 'aria-live': 'polite' });

  for (const c of elementi) {
    const casella = h('input', { type: 'checkbox', name: nome, value: c.id_categoria });
    casella.addEventListener('change', aggiorna);
    caselle.push({ casella, categoria: c });
    pannello.append(
      h('label', { class: 'multi-opzione' }, casella, h('span', {}, h('strong', {}, c.nome), c.descrizione ? h('small', {}, c.descrizione) : null)),
    );
  }

  function aperto() {
    return !pannello.hidden;
  }
  function imposta(apri) {
    pannello.hidden = !apri;
    trigger.setAttribute('aria-expanded', String(apri));
  }

  function aggiorna() {
    const scelte_ = caselle.filter((c) => c.casella.checked);
    const pieno = scelte_.length >= max;
    for (const c of caselle) c.casella.disabled = pieno && !c.casella.checked;
    trigger.replaceChildren(
      h('span', {}, scelte_.length ? `${scelte_.length} ${scelte_.length === 1 ? 'categoria scelta' : 'categorie scelte'}` : etichetta),
      h('span', { class: 'multi-freccia', 'aria-hidden': 'true' }, aperto() ? '▴' : '▾'),
    );
    limite.textContent = pieno ? `Hai raggiunto il massimo di ${max} categorie.` : '';
    monta(
      scelte,
      scelte_.map((c) =>
        h(
          'li',
          { class: 'chip chip-rimovibile' },
          c.categoria.nome,
          h(
            'button',
            {
              type: 'button',
              'aria-label': `Rimuovi ${c.categoria.nome}`,
              on: {
                click: () => {
                  c.casella.checked = false;
                  aggiorna();
                  trigger.focus();
                },
              },
            },
            '×',
          ),
        ),
      ),
    );
  }

  trigger.addEventListener('click', () => {
    imposta(!aperto());
    aggiorna();
  });
  contenitore.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && aperto()) {
      imposta(false);
      aggiorna();
      trigger.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (aperto() && !contenitore.contains(e.target)) {
      imposta(false);
      aggiorna();
    }
  });

  contenitore.classList.add('multi');
  monta(contenitore, trigger, pannello, limite, scelte);
  aggiorna();
}
