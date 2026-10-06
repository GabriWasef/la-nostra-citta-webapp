import { urlAllegato } from '../api.js';
import { badgeStato, h, plurale, tempoFa } from '../dom.js';

export function mediaCopertina(copertina) {
  if (copertina?.tipo_media === 'IMMAGINE') {
    return h('img', { src: urlAllegato(copertina.id_allegato), alt: '', loading: 'lazy', decoding: 'async' });
  }
  return h('div', { class: 'segnaposto', 'aria-hidden': 'true' }, copertina ? '▶' : '📍');
}

/** Card di una segnalazione negli elenchi. */
export function cardSegnalazione(s, { mostraBadgeIa = false } = {}) {
  const autore = s.autore ? s.autore.nome : 'Autore anonimo';
  return h(
    'article',
    { class: 'card' },
    h('div', { class: 'card-media' }, mediaCopertina(s.copertina), badgeStato(s.stato), s.nascosta ? h('span', { class: 'badge badge-nascosta' }, '🚫 Nascosta') : null),
    h(
      'div',
      { class: 'card-body' },
      h('div', { class: 'card-meta' }, `${s.quartiere.nome} · `, h('time', { datetime: s.data_inserimento }, tempoFa(s.data_inserimento))),
      h('h3', {}, h('a', { href: `/segnalazione?id=${s.id_segnalazione}` }, s.titolo)),
      h('p', { class: 'card-estratto' }, s.descrizione),
      s.categorie?.length ? h('ul', { class: 'chips', 'aria-label': 'Categorie' }, s.categorie.map((c) => h('li', { class: 'chip' }, c.nome))) : null,
      mostraBadgeIa && s.da_revisionare_ia ? h('span', { class: 'badge badge-ia' }, '⚠ Da revisionare (IA)') : null,
      h(
        'div',
        { class: 'card-footer' },
        h('span', {}, autore),
        h('span', { class: 'sostegni-count', title: 'Sostegni' }, '♥ ', h('span', { class: 'visually-hidden' }, plurale(s.numero_sostegni, 'sostegno', 'sostegni')), h('span', { 'aria-hidden': 'true' }, String(s.numero_sostegni))),
      ),
    ),
  );
}
