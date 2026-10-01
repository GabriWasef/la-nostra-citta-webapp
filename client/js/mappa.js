// Funzioni comuni per le mappe Leaflet (OpenStreetMap).
// Leaflet è caricato come script classico da /vendor/leaflet e crea window.L.

export const MILANO = [45.4642, 9.19];

// Indirizzo delle tessere raccomandato da OpenStreetMap (senza sottodomini a/b/c).
// Il server invia il Referer (Referrer-Policy): senza, le tessere risultano "Access blocked".
const URL_TESSERE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const COLORI_STATO = {
  APPROVATA: '--s-approvata',
  PRESA_IN_CARICO: '--s-carico',
  IN_VALUTAZIONE: '--s-valutazione',
  DOCUMENTO_PROGRAMMATICO: '--s-documento',
  INVIATA_CANDIDATI: '--s-candidati',
  CHIUSA: '--s-chiusa',
};

export function coloreStato(codice) {
  const variabile = COLORI_STATO[codice] ?? '--s-inserita';
  return getComputedStyle(document.documentElement).getPropertyValue(variabile).trim() || '#555';
}

/** Messaggio sopra la mappa (es. tessere non caricate). */
function avviso(mappa, testo) {
  const div = document.createElement('div');
  div.className = 'mappa-avviso';
  div.setAttribute('role', 'status');
  div.textContent = testo;
  mappa.getContainer().append(div);
  return div;
}

/**
 * Se nessuna tessera si carica (rete del laboratorio che blocca OpenStreetMap,
 * nessuna connessione...) mostra un avviso invece di un riquadro grigio.
 */
function controllaTessere(mappa, livello) {
  let caricate = 0;
  let errori = 0;
  let messaggio = null;
  livello.on('tileload', () => {
    caricate++;
    messaggio?.remove();
    messaggio = null;
  });
  livello.on('tileerror', () => {
    errori++;
    if (!messaggio && caricate === 0 && errori >= 3) {
      messaggio = avviso(
        mappa,
        'Impossibile caricare la mappa: controlla la connessione a internet o che la rete non blocchi tile.openstreetmap.org. ' +
          'Puoi comunque scegliere il punto: i marcatori restano funzionanti.',
      );
    }
  });
}

export function creaMappa(elemento, { centro = MILANO, zoom = 12, interattiva = true } = {}) {
  const L = window.L;
  const mappa = L.map(elemento, {
    scrollWheelZoom: false,
    dragging: interattiva || !L.Browser.mobile,
    tap: interattiva,
  }).setView(centro, zoom);
  const livello = L.tileLayer(URL_TESSERE, {
    maxZoom: 19,
    attribution: '&copy; contributori <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mappa);
  controllaTessere(mappa, livello);
  // La rotella zooma solo dopo un clic sulla mappa, così la pagina scorre normalmente.
  mappa.on('click focus', () => mappa.scrollWheelZoom.enable());
  mappa.on('mouseout blur', () => mappa.scrollWheelZoom.disable());
  return mappa;
}

export function marcatore(latlng, codiceStato) {
  const colore = coloreStato(codiceStato);
  return window.L.circleMarker(latlng, {
    radius: 9,
    color: '#ffffff',
    weight: 2,
    fillColor: colore,
    fillOpacity: 0.95,
  });
}

/** La geolocalizzazione del browser funziona solo su https o su http://localhost. */
export const geolocalizzazioneDisponibile = () => 'geolocation' in navigator && window.isSecureContext;

/** Pulsante "la mia posizione" nell'angolo della mappa. */
export function pulsantePosizione(mappa, { zoom = 15, onPosizione } = {}) {
  const L = window.L;
  const Controllo = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const bottone = L.DomUtil.create('button', 'mappa-pulsante');
      bottone.type = 'button';
      bottone.textContent = '📍';
      bottone.title = 'Centra sulla mia posizione';
      bottone.setAttribute('aria-label', 'Centra la mappa sulla mia posizione');
      L.DomEvent.disableClickPropagation(bottone);
      let punto = null;
      let messaggio = null;
      L.DomEvent.on(bottone, 'click', () => {
        messaggio?.remove();
        if (!geolocalizzazioneDisponibile()) {
          messaggio = avviso(mappa, 'La posizione è disponibile solo aprendo il sito da http://localhost o in HTTPS.');
          return;
        }
        bottone.disabled = true;
        navigator.geolocation.getCurrentPosition(
          (p) => {
            bottone.disabled = false;
            const latlng = [p.coords.latitude, p.coords.longitude];
            mappa.setView(latlng, zoom);
            punto?.remove();
            punto = L.circleMarker(latlng, { radius: 7, color: '#1a73e8', weight: 3, fillColor: '#fff', fillOpacity: 1 })
              .bindTooltip('Sei qui')
              .addTo(mappa);
            onPosizione?.(p.coords);
          },
          () => {
            bottone.disabled = false;
            messaggio = avviso(mappa, 'Posizione non disponibile: controlla i permessi del browser.');
          },
          { enableHighAccuracy: true, timeout: 10000 },
        );
      });
      return bottone;
    },
  });
  new Controllo().addTo(mappa);
}
