// Punto di partenza del pacchetto per il browser: il frontend non ha una fase di build,
// quindi la libreria di caricamento diretto di Vercel Blob viene impacchettata
// in un solo file da server/scripts/build-vercel.js (public/js/vendor/blob-client.js).
export { upload } from '@vercel/blob/client';
