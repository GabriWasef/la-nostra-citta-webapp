import { api, ApiError } from '../api.js';
import * as catalogo from '../catalogo.js';
import { $, h, monta, mostraErrori, opzioni, pulisciErrori } from '../dom.js';
import { caricaAllegatiDiretti } from '../caricamento.js';
import { initPage } from '../layout.js';
import { creaMappa, geolocalizzazioneDisponibile } from '../mappa.js';

// Limiti del server (che resta comunque l'autorità finale): i valori veri arrivano da /api/v1/config.
let MAX_FILE = 5;
const MAX_CATEGORIE = 5;
const LIMITI_MB = { IMMAGINE: 10, VIDEO: 50 };
let caricamentoDiretto = false; // true su Vercel: gli allegati vanno prima sull'archivio
const TIPI = {
  jpg: 'IMMAGINE', jpeg: 'IMMAGINE', png: 'IMMAGINE', webp: 'IMMAGINE',
  mp4: 'VIDEO', mov: 'VIDEO', webm: 'VIDEO',
};

const form = $('#form-segnalazione');
const inputFile = $('#allegati');
let files = [];
let posizione = null; // { lat, lng, origine }
let mappa;
let puntoMappa;
let quartieri = [];
// Indirizzo e quartiere scritti/scelti a mano non vengono sovrascritti dalla mappa.
let indirizzoManuale = false;
let quartiereManuale = false;
let richiestaInversa = 0;

// ---------- Contatori di caratteri ----------

function contatore(input, uscita) {
  const aggiorna = () => {
    uscita.textContent = `${input.value.trim().length}/${input.maxLength}`;
  };
  input.addEventListener('input', aggiorna);
  aggiorna();
}

// ---------- File ----------

const tipoFile = (f) => TIPI[f.name.split('.').pop().toLowerCase()];

function aggiungiFile(nuovi) {
  const scartati = [];
  for (const f of nuovi) {
    const tipo = tipoFile(f);
    if (!tipo) scartati.push(`${f.name}: formato non ammesso`);
    else if (f.size > LIMITI_MB[tipo] * 1024 * 1024) scartati.push(`${f.name}: supera ${LIMITI_MB[tipo]} MB`);
    else if (files.length >= MAX_FILE) scartati.push(`${f.name}: massimo ${MAX_FILE} file`);
    else files.push(f);
  }
  inputFile.value = '';
  renderAnteprime();
  pulisciErrori(form);
  if (scartati.length) {
    mostraErrori(form, new ApiError(400, 'FILE', 'Alcuni file non sono stati aggiunti.', scartati.map((m) => ({ messaggio: m }))));
  }
}

function renderAnteprime() {
  monta(
    $('#anteprime'),
    files.map((f, i) => {
      const url = URL.createObjectURL(f);
      const media =
        tipoFile(f) === 'VIDEO'
          ? h('video', { src: url, muted: true, preload: 'metadata', 'aria-hidden': 'true' })
          : h('img', { src: url, alt: '', on: { load: () => URL.revokeObjectURL(url) } });
      return h(
        'li',
        {},
        media,
        h('span', { class: 'nome' }, f.name),
        h('button', {
          type: 'button',
          class: 'rimuovi',
          'aria-label': `Rimuovi ${f.name}`,
          on: {
            click: () => {
              files.splice(i, 1);
              renderAnteprime();
            },
          },
        }, '×'),
      );
    }),
  );
}

function preparaUpload() {
  $('#hint-allegati').textContent =
    `Almeno 1 e al massimo ${MAX_FILE} file. Foto JPG, PNG o WEBP fino a ${LIMITI_MB.IMMAGINE} MB; ` +
    `video MP4, MOV o WEBM fino a ${LIMITI_MB.VIDEO} MB. Inquadra bene il problema ed evita volti e targhe riconoscibili.`;
  inputFile.addEventListener('change', () => aggiungiFile([...inputFile.files]));
  const zona = $('#dropzone');
  zona.addEventListener('dragover', (e) => {
    e.preventDefault();
    zona.classList.add('attiva');
  });
  zona.addEventListener('dragleave', () => zona.classList.remove('attiva'));
  zona.addEventListener('drop', (e) => {
    e.preventDefault();
    zona.classList.remove('attiva');
    aggiungiFile([...e.dataTransfer.files]);
  });
}

// ---------- Posizione e indirizzo ----------

function mostraCoordinate(testo) {
  $('#coordinate').textContent = testo;
}

function impostaPosizione(lat, lng, origine, { centra = false } = {}) {
  posizione = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), origine };
  if (puntoMappa) {
    puntoMappa.setLatLng([lat, lng]);
  } else {
    puntoMappa = window.L.marker([lat, lng], { draggable: true, keyboard: false, title: 'Trascina per correggere il punto' }).addTo(mappa);
    puntoMappa.on('dragend', () => {
      const { lat: nLat, lng: nLng } = puntoMappa.getLatLng();
      impostaPosizione(nLat, nLng, 'MAPPA');
      completaDaPunto(nLat, nLng);
    });
  }
  if (centra) mappa.setView([lat, lng], Math.max(mappa.getZoom(), 17));
  mostraCoordinate(`Punto selezionato: ${posizione.lat}, ${posizione.lng}`);
  $('#rimuovi-posizione').hidden = false;
}

/** Compila indirizzo e quartiere dal risultato della geocodifica, senza toccare ciò che l'utente ha scritto. */
function applicaRisultato(r) {
  if (r.indirizzo && !indirizzoManuale) form.indirizzo.value = r.indirizzo;
  if (r.quartiere && !quartiereManuale && quartieri.some((q) => q.id_quartiere === r.quartiere.id_quartiere)) {
    form.id_quartiere.value = String(r.quartiere.id_quartiere);
    $('#hint-quartiere').textContent = `Impostato in base al punto sulla mappa: ${r.quartiere.nome}. Puoi cambiarlo.`;
  }
  if (posizione) mostraCoordinate(`Punto selezionato: ${r.etichetta}`);
}

/** Indirizzo del punto toccato o trascinato sulla mappa (geocodifica inversa). */
async function completaDaPunto(lat, lng) {
  const numero = ++richiestaInversa;
  try {
    const { risultato } = await api.get('/geocodifica/inversa', { lat: lat.toFixed(6), lon: lng.toFixed(6) });
    // Se nel frattempo è stato scelto un altro punto, questa risposta non serve più.
    if (numero === richiestaInversa && risultato) applicaRisultato(risultato);
  } catch {
    // La geocodifica è solo un aiuto: il punto resta valido anche senza indirizzo.
  }
}

async function cercaIndirizzo() {
  const campo = $('#cerca-indirizzo');
  const lista = $('#risultati-indirizzo');
  const testo = campo.value.trim();
  if (testo.length < 3) {
    monta(lista, h('li', { class: 'muted small' }, 'Scrivi almeno 3 caratteri.'));
    return;
  }
  const bottone = $('#btn-cerca-indirizzo');
  bottone.disabled = true;
  monta(lista, h('li', { class: 'muted small' }, 'Ricerca in corso…'));
  try {
    const { dati } = await api.get('/geocodifica/cerca', { q: testo });
    if (!dati.length) {
      monta(lista, h('li', { class: 'muted small' }, 'Nessun indirizzo trovato a Milano. Prova a scriverlo in un altro modo, oppure tocca il punto sulla mappa.'));
      return;
    }
    monta(
      lista,
      dati.map((r) =>
        h(
          'li',
          {},
          h(
            'button',
            {
              type: 'button',
              on: {
                click: () => {
                  ++richiestaInversa;
                  impostaPosizione(r.latitudine, r.longitudine, 'GEOCODIFICA', { centra: true });
                  if (r.indirizzo) indirizzoManuale = false;
                  applicaRisultato(r);
                  monta(lista);
                  campo.value = '';
                },
              },
            },
            h('strong', {}, r.etichetta),
            h('span', { class: 'small muted' }, r.descrizione),
          ),
        ),
      ),
    );
  } catch (err) {
    monta(lista, h('li', { class: 'field-error' }, err.message));
  } finally {
    bottone.disabled = false;
  }
}

function preparaMappa() {
  mappa = creaMappa($('#mappa-scelta'), { zoom: 12 });
  mappa.on('click', (e) => {
    impostaPosizione(e.latlng.lat, e.latlng.lng, 'MAPPA');
    completaDaPunto(e.latlng.lat, e.latlng.lng);
  });

  form.indirizzo.addEventListener('input', () => {
    indirizzoManuale = form.indirizzo.value.trim() !== '';
  });
  form.id_quartiere.addEventListener('change', () => {
    quartiereManuale = true;
    $('#hint-quartiere').textContent = '';
  });

  $('#btn-cerca-indirizzo').addEventListener('click', cercaIndirizzo);
  $('#cerca-indirizzo').addEventListener('keydown', (e) => {
    // Invio nel campo di ricerca cerca l'indirizzo invece di inviare il modulo.
    if (e.key === 'Enter') {
      e.preventDefault();
      cercaIndirizzo();
    }
  });

  $('#rimuovi-posizione').addEventListener('click', () => {
    ++richiestaInversa;
    posizione = null;
    puntoMappa?.remove();
    puntoMappa = null;
    mostraCoordinate('Nessun punto selezionato.');
    $('#rimuovi-posizione').hidden = true;
  });

  const bottone = $('#usa-posizione');
  if (!geolocalizzazioneDisponibile()) {
    // Su http con un indirizzo diverso da localhost il browser non concede la posizione.
    bottone.disabled = true;
    bottone.title = 'Disponibile solo aprendo il sito da http://localhost o in HTTPS';
    return;
  }
  bottone.addEventListener('click', () => {
    bottone.disabled = true;
    mostraCoordinate('Ricerca della posizione…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        bottone.disabled = false;
        impostaPosizione(p.coords.latitude, p.coords.longitude, 'UTENTE', { centra: true });
        completaDaPunto(p.coords.latitude, p.coords.longitude);
      },
      () => {
        bottone.disabled = false;
        mostraCoordinate('Posizione non disponibile: cerca l’indirizzo o tocca il punto sulla mappa.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

// ---------- Invio ----------

function validaClient() {
  const errori = [];
  const titolo = form.titolo.value.trim();
  const descrizione = form.descrizione.value.trim();
  if (titolo.length < 5) errori.push({ campo: 'titolo', messaggio: 'Il titolo deve avere almeno 5 caratteri.' });
  if (descrizione.length < 20) errori.push({ campo: 'descrizione', messaggio: 'La descrizione deve avere almeno 20 caratteri.' });
  if (!form.id_quartiere.value) errori.push({ campo: 'id_quartiere', messaggio: 'Scegli il quartiere interessato.' });
  if (!files.length) errori.push({ campo: 'allegati', messaggio: 'Allega almeno una foto o un video.' });
  if (new FormData(form).getAll('categorie').length > MAX_CATEGORIE) {
    errori.push({ campo: 'categorie', messaggio: `Puoi scegliere al massimo ${MAX_CATEGORIE} categorie.` });
  }
  return errori;
}

async function invia(e) {
  e.preventDefault();
  const errori = validaClient();
  if (errori.length) {
    mostraErrori(form, new ApiError(400, 'VALIDAZIONE', 'Controlla i campi evidenziati.', errori));
    return;
  }
  pulisciErrori(form);

  const campi = {
    titolo: form.titolo.value,
    descrizione: form.descrizione.value,
    id_quartiere: form.id_quartiere.value,
    indirizzo: form.indirizzo.value,
    visibilita: form.visibilita.value,
    categorie: new FormData(form).getAll('categorie'),
    usa_posizione_foto: form.usa_posizione_foto.checked,
  };
  if (posizione) Object.assign(campi, { latitudine: posizione.lat, longitudine: posizione.lng, origine_coordinate: posizione.origine });

  const bottone = $('[type="submit"]', form);
  const progresso = $('#progresso');
  const barra = progresso.firstElementChild;
  const avanzamento = (frazione) => {
    barra.style.width = `${Math.round(frazione * 100)}%`;
  };
  bottone.disabled = true;
  bottone.textContent = 'Invio in corso…';
  progresso.hidden = false;
  try {
    let risposta;
    if (caricamentoDiretto) {
      // 1) i file vanno direttamente sull'archivio (fino al 90%), 2) si invia la segnalazione con i loro percorsi.
      const allegati_blob = await caricaAllegatiDiretti(files, utente, (f) => avanzamento(f * 0.9));
      avanzamento(0.95);
      risposta = await api.post('/segnalazioni', { ...campi, allegati_blob });
    } else {
      const dati = new FormData();
      for (const [nome, valore] of Object.entries(campi)) {
        if (Array.isArray(valore)) valore.forEach((v) => dati.append(nome, v));
        else dati.append(nome, String(valore));
      }
      files.forEach((f) => dati.append('allegati', f, f.name));
      risposta = await api.upload('/segnalazioni', dati, avanzamento);
    }
    window.location.href = `/segnalazione?id=${risposta.segnalazione.id_segnalazione}&creata=1`;
  } catch (err) {
    progresso.hidden = true;
    barra.style.width = '0';
    mostraErrori(form, err);
  } finally {
    bottone.disabled = false;
    bottone.textContent = 'Invia la segnalazione';
  }
}

let utente;

async function main() {
  utente = await initPage({ attiva: '/nuova-segnalazione', richiedeAccesso: true });
  try {
    const config = await catalogo.configurazione();
    MAX_FILE = config.maxFiles;
    LIMITI_MB.IMMAGINE = config.maxImageMb;
    LIMITI_MB.VIDEO = config.maxVideoMb;
    caricamentoDiretto = config.caricamentoDiretto;
  } catch {
    // Con la configurazione non raggiungibile restano i valori predefiniti: il server controlla comunque.
  }
  let categorie;
  [quartieri, categorie] = await Promise.all([catalogo.quartieri(), catalogo.categorie()]);
  opzioni($('#id_quartiere'), quartieri, {
    valore: 'id_quartiere',
    etichetta: 'nome',
    vuota: 'Scegli il quartiere…',
    selezionato: utente.id_quartiere_residenza,
  });
  monta(
    $('#categorie'),
    categorie.map((c) => h('label', { class: 'chip-check' }, h('input', { type: 'checkbox', name: 'categorie', value: c.id_categoria }), h('span', {}, c.nome))),
  );
  contatore(form.titolo, $('#cont-titolo'));
  contatore(form.descrizione, $('#cont-descrizione'));
  preparaUpload();
  preparaMappa();
  form.addEventListener('submit', invia);
}

main();
