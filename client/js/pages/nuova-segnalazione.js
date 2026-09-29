import { api, ApiError } from '../api.js';
import * as catalogo from '../catalogo.js';
import { $, h, monta, mostraErrori, opzioni, pulisciErrori } from '../dom.js';
import { initPage } from '../layout.js';
import { creaMappa } from '../mappa.js';

// Stessi limiti del server (che resta comunque l'autorità finale).
const MAX_FILE = 5;
const MAX_CATEGORIE = 5;
const LIMITI_MB = { IMMAGINE: 10, VIDEO: 50 };
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

// ---------- Posizione ----------

function impostaPosizione(lat, lng, origine) {
  posizione = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), origine };
  if (puntoMappa) puntoMappa.setLatLng([lat, lng]);
  else puntoMappa = window.L.marker([lat, lng], { keyboard: false }).addTo(mappa);
  $('#coordinate').textContent = `Punto selezionato: ${posizione.lat}, ${posizione.lng}`;
  $('#rimuovi-posizione').hidden = false;
}

function preparaMappa() {
  mappa = creaMappa($('#mappa-scelta'), { zoom: 12 });
  mappa.on('click', (e) => impostaPosizione(e.latlng.lat, e.latlng.lng, 'MAPPA'));

  $('#rimuovi-posizione').addEventListener('click', () => {
    posizione = null;
    puntoMappa?.remove();
    puntoMappa = null;
    $('#coordinate').textContent = 'Nessun punto selezionato.';
    $('#rimuovi-posizione').hidden = true;
  });

  const bottone = $('#usa-posizione');
  if (!('geolocation' in navigator)) {
    bottone.hidden = true;
    return;
  }
  bottone.addEventListener('click', () => {
    bottone.disabled = true;
    $('#coordinate').textContent = 'Ricerca della posizione…';
    navigator.geolocation.getCurrentPosition(
      (p) => {
        bottone.disabled = false;
        impostaPosizione(p.coords.latitude, p.coords.longitude, 'UTENTE');
        mappa.setView([p.coords.latitude, p.coords.longitude], 17);
      },
      () => {
        bottone.disabled = false;
        $('#coordinate').textContent = 'Posizione non disponibile: seleziona il punto sulla mappa.';
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

  const dati = new FormData();
  for (const campo of ['titolo', 'descrizione', 'id_quartiere', 'indirizzo', 'visibilita']) {
    dati.append(campo, form.elements[campo].value);
  }
  new FormData(form).getAll('categorie').forEach((c) => dati.append('categorie', c));
  dati.append('usa_posizione_foto', form.usa_posizione_foto.checked ? 'true' : 'false');
  if (posizione) {
    dati.append('latitudine', posizione.lat);
    dati.append('longitudine', posizione.lng);
    dati.append('origine_coordinate', posizione.origine);
  }
  files.forEach((f) => dati.append('allegati', f, f.name));

  const bottone = $('[type="submit"]', form);
  const progresso = $('#progresso');
  const barra = progresso.firstElementChild;
  bottone.disabled = true;
  bottone.textContent = 'Invio in corso…';
  progresso.hidden = false;
  try {
    const { segnalazione } = await api.upload('/segnalazioni', dati, (p) => {
      barra.style.width = `${Math.round(p * 100)}%`;
    });
    window.location.href = `/segnalazione?id=${segnalazione.id_segnalazione}&creata=1`;
  } catch (err) {
    progresso.hidden = true;
    barra.style.width = '0';
    mostraErrori(form, err);
  } finally {
    bottone.disabled = false;
    bottone.textContent = 'Invia la segnalazione';
  }
}

async function main() {
  const utente = await initPage({ attiva: '/nuova-segnalazione', richiedeAccesso: true });
  const [quartieri, categorie] = await Promise.all([catalogo.quartieri(), catalogo.categorie()]);
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
