// Funzioni comuni per le mappe Leaflet (OpenStreetMap).
// Leaflet è caricato come script classico da /vendor/leaflet e crea window.L.

export const MILANO = [45.4642, 9.19];

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

export function creaMappa(elemento, { centro = MILANO, zoom = 12, interattiva = true } = {}) {
  const L = window.L;
  const mappa = L.map(elemento, {
    scrollWheelZoom: false,
    dragging: interattiva || !L.Browser.mobile,
    tap: interattiva,
  }).setView(centro, zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; contributori <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mappa);
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
