// Caricamento diretto degli allegati sull'archivio (Vercel Blob), dal browser.
// Su Vercel una richiesta alla funzione non può superare 4,5 MB: foto e video grandi
// vanno quindi inviati all'archivio senza passare dal server. Il server dà un'autorizzazione
// per ogni file (POST /api/v1/allegati/upload) e poi riscarica e ricontrolla tutto
// quando si invia la segnalazione: il browser non è mai considerato affidabile.
import { ApiError } from './api.js';

const AUTORIZZAZIONE = '/api/v1/allegati/upload';
const SOGLIA_MULTIPART = 8 * 1024 * 1024;
const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
};

const estensione = (nome) => nome.split('.').pop().toLowerCase();

/** UUID anche fuori da un contesto sicuro (http con un indirizzo diverso da localhost). */
function idCasuale() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const byte = crypto.getRandomValues(new Uint8Array(16));
  return [...byte].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {File[]} files
 * @param {{id_utente: number}} utente
 * @param {(frazione: number) => void} onProgress avanzamento complessivo da 0 a 1
 * @returns {Promise<{pathname: string, nome: string}[]>} da inviare a POST /segnalazioni (allegati_blob)
 */
export async function caricaAllegatiDiretti(files, utente, onProgress) {
  let upload;
  try {
    ({ upload } = await import('/js/vendor/blob-client.js'));
  } catch {
    throw new ApiError(0, 'LIBRERIA', 'Non è stato possibile caricare il modulo di invio dei file. Ricarica la pagina e riprova.');
  }

  const totale = files.reduce((somma, f) => somma + f.size, 0) || 1;
  let giaCaricati = 0;
  const caricati = [];
  for (const file of files) {
    const ext = estensione(file.name);
    try {
      const risultato = await upload(`tmp/${utente.id_utente}/${idCasuale()}.${ext}`, file, {
        access: 'private',
        handleUploadUrl: AUTORIZZAZIONE,
        contentType: MIME[ext],
        multipart: file.size > SOGLIA_MULTIPART,
        onUploadProgress: ({ loaded }) => onProgress?.((giaCaricati + loaded) / totale),
      });
      caricati.push({ pathname: risultato.pathname, nome: file.name });
    } catch (err) {
      throw new ApiError(0, 'CARICAMENTO_FALLITO', `Il caricamento di "${file.name}" non è riuscito. Controlla la connessione e riprova.`, [
        { messaggio: err.message },
      ]);
    }
    giaCaricati += file.size;
  }
  return caricati;
}
