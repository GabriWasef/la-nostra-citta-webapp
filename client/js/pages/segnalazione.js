import { api, ApiError, urlAllegato } from '../api.js';
import * as catalogo from '../catalogo.js';
import { $, avviso, badgeStato, conInvio, formatData, formatDataOra, h, monta, mostraErrori, parametriUrl } from '../dom.js';
import { initPage, isModeratore } from '../layout.js';
import { creaMappa, marcatore } from '../mappa.js';

const { id, creata } = parametriUrl();
let utente;
let segnalazione;

const ETICHETTE_VISIBILITA = {
  ANONIMA: 'Anonima',
  PRIVATA: 'Visibile solo al comitato',
};

const ETICHETTE_ORIGINE = {
  UTENTE: 'posizione indicata dall’autore',
  MAPPA: 'punto scelto sulla mappa',
  EXIF: 'posizione GPS della foto',
  GEOCODIFICA: 'indirizzo geocodificato',
};

function messaggio(tipo, testo) {
  monta($('#messaggi'), avviso(tipo, testo));
}

// ---------- Galleria ----------

function mediaGrande(a) {
  return a.tipo_media === 'VIDEO'
    ? h('video', { src: a.url, controls: true, preload: 'metadata', playsinline: true }, 'Il tuo browser non riproduce questo video.')
    : h('img', { src: a.url, alt: `Foto allegata alla segnalazione: ${segnalazione.titolo}` });
}

function galleria(allegati) {
  const principale = h('div', { class: 'galleria-principale' }, mediaGrande(allegati[0]));
  if (allegati.length === 1) return principale;
  const miniature = allegati.map((a, i) =>
    h(
      'li',
      {},
      h(
        'button',
        {
          type: 'button',
          'aria-label': `Mostra allegato ${i + 1} di ${allegati.length}`,
          'aria-current': i === 0 ? 'true' : 'false',
          on: {
            click: (e) => {
              monta(principale, mediaGrande(a));
              miniature.forEach((m) => m.firstChild.setAttribute('aria-current', 'false'));
              e.currentTarget.setAttribute('aria-current', 'true');
            },
          },
        },
        a.tipo_media === 'VIDEO' ? h('span', { 'aria-hidden': 'true' }, '▶') : h('img', { src: a.url, alt: '' }),
      ),
    ),
  );
  return [principale, h('ul', { class: 'miniature' }, miniature)];
}

// ---------- Sostegno ----------

function boxSostegno() {
  const s = segnalazione;
  const numero = h('span', { class: 'numero', 'aria-live': 'polite' }, String(s.numero_sostegni));
  const etichetta = h('p', { class: 'muted' }, s.numero_sostegni === 1 ? 'cittadino la sostiene' : 'cittadini la sostengono');
  let azione;

  if (!s.stato.pubblica || s.visibilita === 'PRIVATA') {
    azione = h('p', { class: 'small muted' }, s.visibilita === 'PRIVATA' ? 'Le segnalazioni riservate al comitato non ricevono sostegni.' : 'Potrà essere sostenuta dopo la verifica del comitato.');
  } else if (!utente) {
    azione = h('a', { class: 'btn btn-accent btn-block', href: `/login?ritorno=${encodeURIComponent(location.pathname + location.search)}` }, 'Accedi per sostenerla');
  } else if (s.e_mia) {
    azione = h('p', { class: 'small muted' }, 'È una tua segnalazione: condividila per raccogliere sostegni.');
  } else {
    const bottone = h('button', { type: 'button', class: 'btn btn-block', 'aria-pressed': String(s.sostenuta) });
    const aggiorna = () => {
      bottone.className = `btn btn-block ${s.sostenuta ? '' : 'btn-accent'}`;
      bottone.textContent = s.sostenuta ? '✓ La sostieni · Ritira il sostegno' : '♥ Sostengo questa segnalazione';
      bottone.setAttribute('aria-pressed', String(s.sostenuta));
      numero.textContent = String(s.numero_sostegni);
      etichetta.textContent = s.numero_sostegni === 1 ? 'cittadino la sostiene' : 'cittadini la sostengono';
    };
    bottone.addEventListener('click', async () => {
      bottone.disabled = true;
      try {
        const r = s.sostenuta
          ? await api.del(`/segnalazioni/${s.id_segnalazione}/sostegno`)
          : await api.post(`/segnalazioni/${s.id_segnalazione}/sostegno`);
        s.sostenuta = r.sostenuta;
        s.numero_sostegni = r.numero_sostegni;
        aggiorna();
      } catch (err) {
        messaggio('error', err.message);
      } finally {
        bottone.disabled = false;
      }
    });
    aggiorna();
    azione = bottone;
  }
  return h('section', { class: 'panel box-sostegno', 'aria-labelledby': 't-sostegno' }, h('h2', { id: 't-sostegno', class: 'visually-hidden' }, 'Sostegno'), numero, etichetta, azione);
}

// ---------- Posizione ----------

function boxPosizione() {
  const s = segnalazione;
  const contenuto = [h('p', {}, h('strong', {}, s.quartiere.nome), s.indirizzo ? ` · ${s.indirizzo}` : '')];
  let divMappa = null;
  if (s.latitudine !== null) {
    divMappa = h('div', { class: 'mappa', role: 'img', 'aria-label': `Mappa: la segnalazione si trova a ${s.indirizzo ?? s.quartiere.nome}` });
    contenuto.push(divMappa, h('p', { class: 'small muted' }, `Fonte: ${ETICHETTE_ORIGINE[s.origine_coordinate] ?? 'non indicata'}.`));
  } else {
    contenuto.push(h('p', { class: 'small muted' }, 'Posizione precisa non indicata.'));
  }
  const box = h('section', { class: 'panel', 'aria-labelledby': 't-posizione' }, h('h2', { id: 't-posizione' }, 'Dove'), contenuto);
  if (divMappa) {
    requestAnimationFrame(() => {
      const mappa = creaMappa(divMappa, { centro: [s.latitudine, s.longitudine], zoom: 16, interattiva: false });
      marcatore([s.latitudine, s.longitudine], s.stato.codice).addTo(mappa);
    });
  }
  return box;
}

// ---------- Storico ----------

function boxStorico(storico) {
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 't-storico' },
    h('h2', { id: 't-storico' }, 'Cronologia'),
    h(
      'ol',
      { class: 'timeline' },
      storico.map((v) =>
        h(
          'li',
          {},
          h('time', { datetime: v.data_cambio }, formatDataOra(v.data_cambio)),
          h('strong', {}, v.stato),
          v.operatore ? h('span', { class: 'muted small' }, ` · ${v.operatore}`) : null,
          v.motivazione ? h('div', { class: 'small' }, v.motivazione) : null,
        ),
      ),
    ),
  );
}

// ---------- Moderazione ----------

async function pannelloModerazione() {
  const s = segnalazione;
  const [stati, categorie, { dati: analisi }] = await Promise.all([
    catalogo.stati(),
    catalogo.categorie(),
    api.get(`/moderazione/segnalazioni/${s.id_segnalazione}/analisi`),
  ]);
  const statoCorrente = stati.find((x) => x.codice === s.stato.codice);
  const possibili = stati.filter((x) => statoCorrente.transizioni.includes(x.codice));

  // Cambio di stato
  const formStato = h(
    'form',
    { novalidate: true },
    possibili.length
      ? [
          h('div', { class: 'field' }, h('label', { for: 'm-stato' }, 'Nuovo stato'), h('select', { id: 'm-stato', name: 'codice', required: true }, possibili.map((x) => h('option', { value: x.codice }, x.nome)))),
          h('div', { class: 'field' }, h('label', { for: 'm-motivazione' }, 'Motivazione ', h('span', { class: 'opzionale' }, '(obbligatoria per il rifiuto)')), h('textarea', { id: 'm-motivazione', name: 'motivazione', maxlength: 1000, rows: 3 })),
          h('button', { type: 'submit', class: 'btn btn-primary' }, 'Aggiorna stato'),
        ]
      : h('p', { class: 'muted' }, 'La segnalazione è in uno stato finale.'),
  );
  formStato.addEventListener('submit', (e) => {
    e.preventDefault();
    conInvio(formStato, async () => {
      try {
        const dati = Object.fromEntries(new FormData(formStato));
        await api.patch(`/moderazione/segnalazioni/${s.id_segnalazione}/stato`, dati);
        sessionStorage.setItem('lnc-messaggio', 'Stato aggiornato.');
        location.reload();
      } catch (err) {
        mostraErrori(formStato, err);
      }
    });
  });

  // Visibilità sul sito (nascondere è reversibile) ed eliminazione definitiva
  const campoMotivo = (idCampo, etichetta) =>
    h('div', { class: 'field' }, h('label', { for: idCampo }, etichetta), h('textarea', { id: idCampo, name: 'motivazione', maxlength: 500, rows: 2, required: true }));

  const formVisibilita = h(
    'form',
    { novalidate: true },
    s.nascosta
      ? [
          avviso('warning', h('strong', {}, 'La segnalazione è nascosta. '), `Non compare agli altri utenti${s.motivo_nascondimento ? `. Motivo: ${s.motivo_nascondimento}` : '.'}`),
          h('button', { type: 'submit', class: 'btn btn-primary' }, 'Rendi di nuovo visibile'),
        ]
      : [
          h('p', { class: 'small muted' }, 'Una segnalazione nascosta sparisce da elenchi, classifica e mappa e non si può più sostenere. La vedono solo l’autore e il comitato. Si può ripristinare in ogni momento.'),
          campoMotivo('m-nascondi', 'Motivo (visibile all’autore e al comitato)'),
          h('button', { type: 'submit', class: 'btn' }, 'Nascondi dal sito'),
        ],
  );
  formVisibilita.addEventListener('submit', (e) => {
    e.preventDefault();
    conInvio(formVisibilita, async () => {
      try {
        const base = `/moderazione/segnalazioni/${s.id_segnalazione}`;
        if (s.nascosta) await api.post(`${base}/mostra`);
        else await api.post(`${base}/nascondi`, Object.fromEntries(new FormData(formVisibilita)));
        sessionStorage.setItem('lnc-messaggio', s.nascosta ? 'La segnalazione è di nuovo visibile.' : 'La segnalazione è stata nascosta.');
        location.reload();
      } catch (err) {
        mostraErrori(formVisibilita, err);
      }
    });
  });

  const formElimina = h(
    'form',
    { novalidate: true, class: 'zona-pericolosa' },
    h('p', { class: 'small' }, 'L’eliminazione è definitiva: si perdono testo, allegati, sostegni e cronologia. Per toglierla solo dalla vista pubblica usa “Nascondi dal sito”.'),
    campoMotivo('m-elimina', 'Motivo (registrato nel registro delle operazioni)'),
    h('button', { type: 'submit', class: 'btn btn-danger' }, 'Elimina definitivamente'),
  );
  formElimina.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!confirm(`Eliminare definitivamente la segnalazione “${s.titolo}”? L’operazione non si può annullare.`)) return;
    conInvio(formElimina, async () => {
      try {
        await api.del(`/moderazione/segnalazioni/${s.id_segnalazione}`, Object.fromEntries(new FormData(formElimina)));
        sessionStorage.setItem('lnc-messaggio', 'Segnalazione eliminata.');
        window.location.href = '/moderazione';
      } catch (err) {
        mostraErrori(formElimina, err);
      }
    });
  });

  // Categorie
  const attuali = new Set(s.categorie.map((c) => c.id_categoria));
  const formCategorie = h(
    'form',
    { novalidate: true },
    h(
      'fieldset',
      {},
      h('legend', { class: 'visually-hidden' }, 'Categorie della segnalazione'),
      h(
        'div',
        { class: 'chip-group' },
        categorie.map((c) => h('label', { class: 'chip-check' }, h('input', { type: 'checkbox', name: 'categorie', value: c.id_categoria, checked: attuali.has(c.id_categoria) }), h('span', {}, c.nome))),
      ),
    ),
    h('button', { type: 'submit', class: 'btn' }, 'Salva categorie'),
  );
  formCategorie.addEventListener('submit', (e) => {
    e.preventDefault();
    conInvio(formCategorie, async () => {
      try {
        const scelte = new FormData(formCategorie).getAll('categorie').map(Number);
        await api.put(`/moderazione/segnalazioni/${s.id_segnalazione}/categorie`, { categorie: scelte });
        sessionStorage.setItem('lnc-messaggio', 'Categorie aggiornate.');
        location.reload();
      } catch (err) {
        mostraErrori(formCategorie, err);
      }
    });
  });

  // Allegati
  const allegati = h(
    'ul',
    { class: 'analisi-lista' },
    s.allegati.map((a) =>
      h(
        'li',
        {},
        h('strong', {}, a.nome_file),
        h('div', { class: 'small muted' }, `${a.tipo_media === 'VIDEO' ? 'Video' : 'Immagine'} · ${(a.dimensione_bytes / 1024).toFixed(0)} KB`, a.latitudine_exif !== null ? ` · GPS EXIF ${a.latitudine_exif}, ${a.longitudine_exif}` : ' · nessun GPS EXIF'),
        h('div', { class: 'form-actions' },
          h('a', { class: 'btn btn-small', href: urlAllegato(a.id_allegato), target: '_blank', rel: 'noopener' }, 'Apri'),
          h('button', {
            type: 'button',
            class: 'btn btn-small btn-danger',
            on: {
              click: async () => {
                if (!confirm(`Eliminare l’allegato "${a.nome_file}"?`)) return;
                try {
                  await api.del(`/moderazione/allegati/${a.id_allegato}`);
                  sessionStorage.setItem('lnc-messaggio', 'Allegato eliminato.');
                  location.reload();
                } catch (err) {
                  messaggio('error', err.message);
                }
              },
            },
          }, 'Elimina')),
      ),
    ),
  );

  // Analisi automatiche
  const listaAnalisi = analisi.length
    ? h(
        'ul',
        { class: 'analisi-lista' },
        analisi.map((a) =>
          h(
            'li',
            {},
            h('strong', {}, a.tipo_analisi.replaceAll('_', ' ').toLowerCase()),
            ' ',
            a.esito ? h('span', { class: `badge ${a.esito === 'OK' ? '' : 'badge-ia'}` }, a.esito.replace('_', ' ')) : null,
            h('div', { class: 'small muted' }, `${a.modello} · ${formatDataOra(a.data_analisi)}${a.punteggio !== null ? ` · punteggio ${a.punteggio}` : ''}`),
            h('pre', {}, JSON.stringify(a.risultato, null, 2)),
            a.esito_revisione
              ? h('div', { class: 'small' }, `Revisione: ${a.esito_revisione.toLowerCase()}${a.revisore ? ` (${a.revisore})` : ''}`)
              : a.esito === 'OK'
                ? null
                : h(
                  'div',
                  { class: 'form-actions' },
                  ['CONFERMATA', 'RESPINTA'].map((esito) =>
                    h('button', {
                      type: 'button',
                      class: 'btn btn-small',
                      on: {
                        click: async () => {
                          try {
                            await api.patch(`/moderazione/analisi/${a.id_analisi}`, { esito_revisione: esito });
                            sessionStorage.setItem('lnc-messaggio', 'Revisione registrata.');
                            location.reload();
                          } catch (err) {
                            messaggio('error', err.message);
                          }
                        },
                      },
                    }, esito === 'CONFERMATA' ? 'Conferma risultato' : 'Respingi risultato'),
                  ),
                ),
          ),
        ),
      )
    : h('p', { class: 'muted' }, 'Nessuna analisi automatica.');

  return h(
    'section',
    { class: 'panel pannello-moderazione stack', 'aria-labelledby': 't-moderazione' },
    h('h2', { id: 't-moderazione' }, 'Moderazione'),
    s.autore?.id_utente ? h('p', { class: 'small muted' }, `Autore: ${s.autore.nome} (utente n. ${s.autore.id_utente}) · visibilità ${s.visibilita.toLowerCase()}`) : null,
    h('h3', {}, 'Stato'),
    formStato,
    h('h3', {}, 'Visibilità sul sito'),
    formVisibilita,
    h('h3', {}, 'Categorie'),
    formCategorie,
    h('h3', {}, 'Allegati'),
    allegati,
    h('h3', {}, 'Analisi automatiche'),
    listaAnalisi,
    h('h3', { class: 'titolo-pericolo' }, 'Elimina la segnalazione'),
    formElimina,
  );
}

// ---------- Pagina ----------

async function main() {
  utente = await initPage();
  if (!id || !/^\d+$/.test(id)) {
    monta($('#segnalazione'), avviso('error', 'Segnalazione non indicata.'));
    return;
  }
  if (creata) messaggio('success', 'Segnalazione inviata! Il comitato la verificherà prima della pubblicazione: puoi seguirne lo stato dal tuo profilo.');
  const flash = sessionStorage.getItem('lnc-messaggio');
  if (flash) {
    sessionStorage.removeItem('lnc-messaggio');
    messaggio('success', flash);
  }

  try {
    const [{ segnalazione: s }, { dati: storico }] = await Promise.all([
      api.get(`/segnalazioni/${id}`),
      api.get(`/segnalazioni/${id}/storico`),
    ]);
    segnalazione = s;
    document.title = `${s.titolo} · La Nostra Città`;

    const colonnaPrincipale = h(
      'div',
      { class: 'stack' },
      h(
        'header',
        { class: 'dettaglio-head' },
        h(
          'div',
          { class: 'badges' },
          badgeStato(s.stato),
          ETICHETTE_VISIBILITA[s.visibilita] ? h('span', { class: 'badge' }, ETICHETTE_VISIBILITA[s.visibilita]) : null,
          s.nascosta ? h('span', { class: 'badge badge-nascosta' }, '🚫 Nascosta') : null,
          s.da_revisionare_ia ? h('span', { class: 'badge badge-ia' }, '⚠ Analisi IA da revisionare') : null,
        ),
        h('h1', {}, s.titolo),
        h('p', { class: 'muted' }, `${s.quartiere.nome} · inserita il `, h('time', { datetime: s.data_inserimento }, formatData(s.data_inserimento)), ` · ${s.autore ? s.autore.nome : 'autore anonimo'}`),
      ),
      s.allegati.length ? galleria(s.allegati) : null,
      h('p', { class: 'descrizione' }, s.descrizione),
      s.categorie.length
        ? h(
            'ul',
            { class: 'chips', 'aria-label': 'Categorie' },
            s.categorie.map((c) => h('li', { class: 'chip' }, c.nome, c.origine_assegnazione === 'IA' ? h('small', {}, ` · proposta IA ${Math.round(c.affidabilita_ia * 100)}%`) : null)),
          )
        : null,
    );

    // Su mobile l'ordine è: contenuto, sostegno e posizione, cronologia (e moderazione).
    const laterale = h('aside', { class: 'stack' }, boxSostegno(), boxPosizione());
    const seguito = h('div', { class: 'stack dettaglio-seguito' }, boxStorico(storico));
    monta($('#segnalazione'), h('article', { class: 'dettaglio' }, colonnaPrincipale, laterale, seguito));

    if (isModeratore(utente)) {
      seguito.append(await pannelloModerazione());
    }
    if (s.nascosta && s.e_mia) {
      laterale.prepend(avviso('warning', `Il comitato ha nascosto questa segnalazione: non è visibile agli altri utenti.${s.motivo_nascondimento ? ` Motivo: ${s.motivo_nascondimento}` : ''}`));
    } else if (!s.stato.pubblica && s.e_mia) {
      laterale.prepend(avviso('info', `La segnalazione è nello stato “${s.stato.nome}”: sarà pubblica dopo l’approvazione del comitato.`));
    }
  } catch (err) {
    monta(
      $('#segnalazione'),
      avviso('error', err instanceof ApiError && err.status === 404 ? 'Questa segnalazione non esiste o non è visibile.' : err.message),
    );
  }
}

main();
