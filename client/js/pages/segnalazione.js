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

const TIPI_ANALISI = {
  MODERAZIONE_TESTO: 'Moderazione del testo',
  CLASSIFICAZIONE_TESTO: 'Categorie suggerite',
  ESTRAZIONE_EXIF: 'Metadati della foto (EXIF)',
  ANALISI_IMMAGINE: 'Controllo tecnico dell’immagine',
  VERIFICA_PERTINENZA: 'Pertinenza dell’immagine',
  VERIFICA_AUTENTICITA: 'Verifica di autenticità',
  ANALISI_VIDEO: 'Analisi del video',
};

const MOTIVI = {
  LINGUAGGIO_VOLGARE: 'linguaggio volgare',
  INSULTI: 'insulti',
  LINGUAGGIO_ODIO: 'linguaggio d’odio',
  MINACCE: 'minacce',
  SPAM: 'possibile spam',
  TESTO_GRAVE: 'contenuto grave nel testo',
  TESTO_NON_ACCETTABILE: 'testo non accettabile',
  TESTO_DA_VERIFICARE: 'testo da verificare',
  ESITO_SUGGERITO_DAL_MODELLO: 'il modello suggerisce una verifica',
  CATEGORIE_DA_CONFERMARE: 'categorie da confermare',
  NESSUNA_CATEGORIA_SUGGERITA: 'nessuna categoria suggerita',
  CATEGORIA_DIVERSA_DAL_SUGGERIMENTO: 'categoria diversa da quella suggerita',
  IMMAGINE_INAPPROPRIATA: 'immagine inappropriata',
  IMMAGINE_NON_CORRISPONDE_AL_TESTO: 'l’immagine non corrisponde al testo',
  IMMAGINE_NON_CORRISPONDE_ALLA_CATEGORIA: 'l’immagine non corrisponde alla categoria',
  PERTINENZA_NON_VALUTABILE: 'pertinenza non valutabile',
  CONFIDENZA_BASSA: 'confidenza bassa',
  SEGNALE_AUTENTICITA: 'possibile immagine generata o ritoccata',
  SEGNALE_MODELLO: 'il modello sospetta un’immagine generata o ritoccata',
  EXIF_POSIZIONE_LONTANA: 'foto scattata lontano dal luogo indicato',
  FOTO_GIA_USATA: 'foto già usata in un’altra segnalazione',
  PROVIDER_NON_DISPONIBILE: 'servizio di analisi non disponibile',
  ANALISI_IN_CORSO: 'analisi ancora in corso',
  RISOLUZIONE_BASSA: 'risoluzione bassa',
  IMMAGINE_TROPPO_SCURA: 'immagine troppo scura',
  IMMAGINE_SOVRAESPOSTA: 'immagine sovraesposta',
};
const motivo = (m) => MOTIVI[m] ?? String(m).toLowerCase().replaceAll('_', ' ');
const ETICHETTE_ESITO = { OK: 'OK', DA_REVISIONARE: 'Da revisionare', BLOCCATO: 'Bloccato' };
const badgeEsito = (esito) => h('span', { class: `badge badge-esito esito-${esito.toLowerCase()}` }, ETICHETTE_ESITO[esito] ?? esito);
const ETICHETTE_REVISIONE = { CONFERMATA: 'Conferma', CORRETTA: 'Correggi', RESPINTA: 'Respingi' };
const SPIEGAZIONE_REVISIONE = {
  CONFERMATA: 'Il risultato è corretto',
  CORRETTA: 'Il risultato è in parte sbagliato e l’hai corretto (per esempio cambiando le categorie)',
  RESPINTA: 'Il risultato è sbagliato',
};

/** Esito complessivo suggerito: lo decide sempre il comitato. */
function riquadroRiepilogo(r) {
  if (!r?.esito) return null;
  return h(
    'div',
    { class: `riepilogo-ia esito-${r.esito.toLowerCase()}` },
    h('p', {}, h('strong', {}, 'Esito suggerito: '), badgeEsito(r.esito)),
    r.motivi.length ? h('p', { class: 'small' }, `Motivi: ${r.motivi.map(motivo).join('; ')}.`) : null,
    h(
      'p',
      { class: 'small muted' },
      [
        r.da_revisionare ? `${r.da_revisionare} analisi da revisionare` : 'Nessuna analisi da revisionare',
        r.analisi_in_corso ? `${r.analisi_in_corso} in corso` : null,
        r.analisi_non_riuscite ? `${r.analisi_non_riuscite} non riuscite` : null,
      ].filter(Boolean).join(' · ') + '. È un suggerimento: la decisione spetta al comitato.',
    ),
  );
}

/** Dettagli leggibili di un'analisi, oltre al JSON completo. */
function dettagliAnalisi(a) {
  const r = a.risultato ?? {};
  const righe = [];
  if (r.errore === 'PROVIDER_NON_DISPONIBILE') righe.push('Il servizio di analisi non ha risposto dopo più tentativi.');
  if (r.spiegazione) righe.push(r.spiegazione);
  if (a.tipo_analisi === 'VERIFICA_PERTINENZA' && r.immagine?.osservato) righe.push(`Nell’immagine: ${r.immagine.osservato}`);
  if (a.tipo_analisi === 'VERIFICA_PERTINENZA' && r.immagine?.categoria_suggerita) righe.push(`Categoria che l’immagine mostra meglio: ${r.immagine.categoria_suggerita}`);
  if (a.tipo_analisi === 'CLASSIFICAZIONE_TESTO' && r.suggerite?.length) {
    righe.push(`Suggerite: ${r.suggerite.map((c) => `${c.nome} (${Math.round(c.affidabilita * 100)}%)`).join(', ')}`);
  }
  if (a.tipo_analisi === 'VERIFICA_AUTENTICITA') {
    const e = r.exif ?? {};
    righe.push(
      e.stato === 'NON_VERIFICABILE' ? `Posizione: non verificabile. ${e.nota ?? ''}`
        : `Posizione della foto a ${e.distanza_m} m da quella indicata (soglia ${e.soglia_m} m).`,
    );
    if (e.data_scatto) righe.push(`Scattata il ${formatDataOra(e.data_scatto)}${e.giorni_prima_dell_invio > 0 ? `, ${e.giorni_prima_dell_invio} giorni prima dell’invio` : ''}.`);
    if (r.duplicati?.stato === 'TROVATI') {
      righe.push(h('span', {}, 'Foto già usata nella segnalazione ', h('a', { href: `/segnalazione?id=${r.duplicati.id_segnalazione_precedente}` }, `n. ${r.duplicati.id_segnalazione_precedente}`), '.'));
    }
    if (r.segnale_modello?.stato === 'SOSPETTO') righe.push(`Il modello sospetta un’immagine generata o ritoccata (confidenza ${Math.round(r.segnale_modello.confidenza * 100)}%): è solo un indizio.`);
  }
  return righe.map((t) => h('div', { class: 'small' }, t));
}

function schedaAnalisi(a, perAllegato) {
  const r = a.risultato ?? {};
  const motivi = r.motivi_esito ?? r.motivi ?? r.problemi ?? [];
  const riferimento = a.id_allegato ? ` · ${perAllegato.get(a.id_allegato) ?? `allegato n. ${a.id_allegato}`}` : '';
  return h(
    'li',
    {},
    h('strong', {}, TIPI_ANALISI[a.tipo_analisi] ?? a.tipo_analisi),
    ' ',
    a.esito ? badgeEsito(a.esito) : null,
    h('div', { class: 'small muted' }, `${a.modello} · ${formatDataOra(a.data_analisi)}${a.punteggio !== null ? ` · punteggio ${a.punteggio}` : ''}${riferimento}`),
    motivi.length && a.esito !== 'OK' ? h('div', { class: 'small' }, `Motivi: ${motivi.map(motivo).join('; ')}.`) : null,
    ...dettagliAnalisi(a),
    h('details', {}, h('summary', { class: 'small' }, 'Risultato completo'), h('pre', {}, JSON.stringify(r, null, 2))),
    a.esito_revisione
      ? h('div', { class: 'small' }, `Revisione: ${a.esito_revisione.toLowerCase()}${a.revisore ? ` (${a.revisore})` : ''}`)
      : h(
        'div',
        { class: 'form-actions' },
        ['CONFERMATA', 'CORRETTA', 'RESPINTA'].map((esito) =>
          h('button', {
            type: 'button',
            class: 'btn btn-small',
            title: SPIEGAZIONE_REVISIONE[esito],
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
          }, ETICHETTE_REVISIONE[esito]),
        ),
      ),
  );
}

async function pannelloModerazione() {
  const s = segnalazione;
  const [stati, categorie, { dati: analisi, riepilogo }] = await Promise.all([
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
        h('div', { class: 'small muted' }, `${a.tipo_media === 'VIDEO' ? 'Video' : 'Immagine'} · ${(a.dimensione_bytes / 1024).toFixed(0)} KB`, a.latitudine_exif !== null ? ` · GPS EXIF ${a.latitudine_exif}, ${a.longitudine_exif}` : ' · nessun GPS EXIF', a.data_scatto_exif ? ` · scattata il ${formatDataOra(a.data_scatto_exif)}` : ''),
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

  // Analisi automatiche: suggerimenti per il comitato, mai applicati da soli.
  const perAllegato = new Map(s.allegati.map((a) => [a.id_allegato, a.nome_file]));
  const listaAnalisi = analisi.length
    ? h('ul', { class: 'analisi-lista' }, analisi.map((a) => schedaAnalisi(a, perAllegato)))
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
    riquadroRiepilogo(riepilogo),
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
