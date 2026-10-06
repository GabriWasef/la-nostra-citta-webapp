// Content Security Policy del sito. È definita qui una volta sola:
// - il server Express la invia per le risposte dell'API (e per le pagine, fuori da Vercel);
// - su Vercel le pagine statiche non passano da Express, quindi la stessa politica è riportata
//   in vercel.json (un test verifica che coincidano).
const HOST_BLOB = 'https://*.blob.vercel-storage.com';
const HOST_TESSERE = 'https://tile.openstreetmap.org';

/**
 * @param {{ blob?: boolean, produzione?: boolean }} opzioni
 *   blob: gli allegati stanno su Vercel Blob (link firmati e caricamento diretto dal browser)
 */
export function direttiveCsp({ blob = false, produzione = false } = {}) {
  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    scriptSrcAttr: ["'none'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", 'data:', 'blob:', HOST_TESSERE, ...(blob ? [HOST_BLOB] : [])],
    mediaSrc: ["'self'", 'blob:', ...(blob ? [HOST_BLOB] : [])],
    connectSrc: ["'self'", ...(blob ? ['https://vercel.com', HOST_BLOB] : [])],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    ...(produzione ? { upgradeInsecureRequests: [] } : {}),
  };
}

const kebab = (nome) => nome.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Le stesse direttive come stringa dell'intestazione Content-Security-Policy. */
export function cspComeStringa(direttive) {
  return Object.entries(direttive)
    .map(([nome, valori]) => [kebab(nome), ...valori].join(' '))
    .join('; ');
}
