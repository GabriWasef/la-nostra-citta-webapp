// Intestazione, piè di pagina e controllo di accesso comuni a tutte le pagine.
import { api } from './api.js';
import { $, avviso, h, monta } from './dom.js';

let utenteCorrente;

export async function getUtente({ ricarica = false } = {}) {
  if (utenteCorrente === undefined || ricarica) {
    try {
      utenteCorrente = (await api.get('/auth/me')).utente;
    } catch {
      utenteCorrente = null;
    }
  }
  return utenteCorrente;
}

export const isModeratore = (u) => u?.ruolo === 'MODERATORE' || u?.ruolo === 'AMMINISTRATORE';
export const isAdmin = (u) => u?.ruolo === 'AMMINISTRATORE';

function voce(href, testo, attiva) {
  return h('li', {}, h('a', { href, 'aria-current': attiva === href ? 'page' : null }, testo));
}

async function esci() {
  try {
    await api.post('/auth/logout');
  } finally {
    window.location.href = '/';
  }
}

function renderHeader(utente, attiva) {
  const header = $('#site-header');
  const nav = h(
    'nav',
    { class: 'site-nav', id: 'menu-principale', 'aria-label': 'Menu principale' },
    h(
      'ul',
      {},
      voce('/', 'Segnalazioni', attiva),
      voce('/mappa', 'Mappa', attiva),
      voce('/classifica', 'Classifica', attiva),
      isModeratore(utente) ? voce('/moderazione', 'Moderazione', attiva) : null,
      isAdmin(utente) ? voce('/admin', 'Amministrazione', attiva) : null,
    ),
    h(
      'div',
      { class: 'nav-account' },
      utente
        ? [
            h('a', { href: '/profilo', 'aria-current': attiva === '/profilo' ? 'page' : null }, `👤 ${utente.nome}`),
            h('button', { class: 'link-button', type: 'button', on: { click: esci } }, 'Esci'),
            h('a', { class: 'btn btn-accent btn-small', href: '/nuova-segnalazione' }, '+ Segnala'),
          ]
        : [
            h('a', { href: `/login?ritorno=${encodeURIComponent(location.pathname + location.search)}` }, 'Accedi'),
            h('a', { class: 'btn btn-primary btn-small', href: '/registrazione' }, 'Registrati'),
          ],
    ),
  );

  const toggle = h(
    'button',
    {
      class: 'btn btn-small nav-toggle',
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': 'menu-principale',
      on: {
        click: () => {
          const aperto = nav.classList.toggle('aperto');
          toggle.setAttribute('aria-expanded', String(aperto));
        },
      },
    },
    '☰ Menu',
  );

  monta(
    header,
    h(
      'div',
      { class: 'container header-inner' },
      h(
        'a',
        { class: 'brand', href: '/' },
        h('img', { src: '/img/logo.svg', alt: '', width: 36, height: 36 }),
        h('span', {}, 'La Nostra Città', h('small', {}, 'Il Nostro Futuro')),
      ),
      toggle,
      nav,
    ),
  );
}

function renderFooter() {
  monta(
    $('#site-footer'),
    h(
      'div',
      { class: 'container footer-inner' },
      h('p', { class: 'small' }, 'Un’iniziativa del comitato cittadino ', h('strong', {}, 'Insieme per Milano'), '.'),
      h(
        'ul',
        {},
        h('li', {}, h('a', { href: '/privacy' }, 'Privacy')),
        h('li', {}, h('a', { href: '/classifica' }, 'Priorità cittadine')),
        h('li', {}, h('a', { href: '/nuova-segnalazione' }, 'Fai una segnalazione')),
      ),
    ),
  );
}

/**
 * Prepara la pagina: header, footer e controlli di accesso.
 * @returns {Promise<object|null>} l'utente collegato
 */
export async function initPage({ attiva = null, richiedeAccesso = false, ruoli = null } = {}) {
  const utente = await getUtente();
  renderHeader(utente, attiva);
  renderFooter();

  if ((richiedeAccesso || ruoli) && !utente) {
    window.location.replace(`/login?ritorno=${encodeURIComponent(location.pathname + location.search)}`);
    return new Promise(() => {}); // la pagina viene abbandonata
  }
  if (ruoli && !ruoli.includes(utente.ruolo)) {
    monta(
      $('main'),
      h('div', { class: 'container' }, h('div', { class: 'page-header' }, h('h1', {}, 'Accesso non consentito')), avviso('error', 'Questa sezione è riservata ai membri del comitato.')),
    );
    return new Promise(() => {});
  }
  return utente;
}

/** Destinazione sicura dopo il login: solo percorsi interni. */
export function ritornoSicuro(valore, predefinito = '/') {
  // Niente "//host" né "/\host": i browser trattano la barra rovesciata come "/".
  return typeof valore === 'string' && /^\/(?![\/\\])/.test(valore) ? valore : predefinito;
}
