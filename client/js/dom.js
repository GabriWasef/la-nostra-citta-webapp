// Utilità per costruire l'interfaccia. Il testo viene sempre inserito come
// textContent: i contenuti degli utenti non passano mai da innerHTML (XSS).

const PROPRIETA = new Set(['hidden', 'disabled', 'checked', 'selected', 'required', 'multiple', 'value', 'readOnly']);

/**
 * Crea un elemento: h('a', { class: 'btn', href: '/' }, 'Testo', figlio)
 * attributi speciali: class, text, on: {evento: fn}, dataset: {...}
 */
export function h(tag, attrs = {}, ...figli) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'on') for (const [evento, fn] of Object.entries(v)) el.addEventListener(evento, fn);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (PROPRIETA.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  aggiungi(el, figli);
  return el;
}

function aggiungi(el, figli) {
  for (const f of figli.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function monta(contenitore, ...figli) {
  contenitore.replaceChildren();
  aggiungi(contenitore, figli);
}

// ---------- Formattazione ----------

const fmtData = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtDataOra = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
const fmtRelativo = new Intl.RelativeTimeFormat('it', { numeric: 'auto' });

export const formatData = (iso) => fmtData.format(new Date(iso));
export const formatDataOra = (iso) => fmtDataOra.format(new Date(iso));

export function tempoFa(iso) {
  const secondi = (new Date(iso) - Date.now()) / 1000;
  const unita = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [u, s] of unita) {
    if (Math.abs(secondi) >= s) return fmtRelativo.format(Math.round(secondi / s), u);
  }
  return 'adesso';
}

export const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

// ---------- Componenti ----------

export function badgeStato(stato) {
  return h('span', { class: `badge badge-stato stato-${stato.codice.toLowerCase()}` }, stato.nome);
}

export function avviso(tipo, ...contenuto) {
  return h('div', { class: `alert alert-${tipo}`, role: tipo === 'error' ? 'alert' : 'status' }, ...contenuto);
}

export function statoVuoto(icona, titolo, testo, azione = null) {
  return h('div', { class: 'vuoto' }, h('div', { class: 'icona', 'aria-hidden': 'true' }, icona), h('h2', {}, titolo), h('p', { class: 'muted' }, testo), azione);
}

export function caricamento(n = 3) {
  return h(
    'div',
    { class: 'griglia', 'aria-busy': 'true', 'aria-label': 'Caricamento in corso' },
    Array.from({ length: n }, () => h('div', { class: 'scheletro' })),
  );
}

export function paginazione({ pagina, pagine }, onCambio) {
  if (pagine <= 1) return null;
  return h(
    'nav',
    { class: 'paginazione', 'aria-label': 'Paginazione' },
    h('button', { class: 'btn btn-small', type: 'button', disabled: pagina <= 1, on: { click: () => onCambio(pagina - 1) } }, '← Precedente'),
    h('span', { class: 'muted small' }, `Pagina ${pagina} di ${pagine}`),
    h('button', { class: 'btn btn-small', type: 'button', disabled: pagina >= pagine, on: { click: () => onCambio(pagina + 1) } }, 'Successiva →'),
  );
}

export function opzioni(select, elementi, { valore, etichetta, vuota = null, selezionato = null }) {
  monta(
    select,
    vuota !== null ? h('option', { value: '' }, vuota) : null,
    elementi.map((e) => h('option', { value: e[valore], selected: String(e[valore]) === String(selezionato ?? '') }, e[etichetta])),
  );
}

// ---------- Errori nei form ----------

export function pulisciErrori(form) {
  $$('.field-error', form).forEach((e) => e.remove());
  $$('[aria-invalid]', form).forEach((e) => {
    e.removeAttribute('aria-invalid');
    const descritto = (e.getAttribute('aria-describedby') ?? '').split(' ').filter((id) => !id.startsWith('err-'));
    if (descritto.length) e.setAttribute('aria-describedby', descritto.join(' '));
    else e.removeAttribute('aria-describedby');
  });
  $('.form-alert', form)?.remove();
}

/** Mostra l'errore dell'API: accanto ai campi quando indicati, altrimenti in cima al form. */
export function mostraErrori(form, errore) {
  pulisciErrori(form);
  const nonAssociati = [];
  for (const d of errore.details ?? []) {
    const campo = d.campo && form.elements[d.campo.split('.')[0]];
    const input = campo instanceof RadioNodeList ? campo[0] : campo;
    if (!input) {
      nonAssociati.push(d.messaggio);
      continue;
    }
    const id = `err-${input.name}`;
    if (document.getElementById(id)) continue;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', `${input.getAttribute('aria-describedby') ?? ''} ${id}`.trim());
    const contenitore = input.closest('.field, fieldset') ?? input.parentElement;
    contenitore.append(h('span', { class: 'field-error', id }, d.messaggio));
  }
  const alert = avviso('error', h('strong', {}, errore.message), nonAssociati.length ? h('ul', {}, nonAssociati.map((m) => h('li', {}, m))) : null);
  alert.classList.add('form-alert');
  alert.tabIndex = -1;
  form.prepend(alert);
  const primoInvalido = $('[aria-invalid="true"]', form);
  (primoInvalido ?? alert).focus();
}

/** Disabilita il pulsante di invio durante l'operazione. */
export async function conInvio(form, fn) {
  const bottone = $('[type="submit"]', form);
  const testo = bottone?.textContent;
  if (bottone) {
    bottone.disabled = true;
    bottone.textContent = 'Attendere…';
  }
  try {
    return await fn();
  } finally {
    if (bottone) {
      bottone.disabled = false;
      bottone.textContent = testo;
    }
  }
}

export const datiForm = (form) => Object.fromEntries(new FormData(form));

export function parametriUrl() {
  return Object.fromEntries(new URLSearchParams(window.location.search));
}

export function aggiornaUrl(parametri) {
  const url = new URL(window.location.href);
  url.search = '';
  for (const [k, v] of Object.entries(parametri)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  history.replaceState(null, '', url);
}
