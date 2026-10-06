import { env } from '../config/env.js';
import { createBlobStorage } from './blobStorage.js';
import { createLocalStorage } from './localStorage.js';

// "locale": cartella uploads (sviluppo, server singolo, Docker).
// "blob": Vercel Blob privato (Vercel, dove il disco non è permanente).
// Un archivio S3-compatibile potrà esporre la stessa interfaccia.
export const storage =
  env.storageDriver === 'blob'
    ? createBlobStorage({ durataLinkMs: env.ALLEGATI_LINK_MINUTI * 60 * 1000 })
    : createLocalStorage(env.uploadDir);

/**
 * Punto di aggancio per l'antivirus (es. ClamAV via clamd) in produzione.
 * In sviluppo non esegue controlli.
 * @returns {Promise<{pulito: boolean, motivo?: string}>}
 */
export async function scansionaFile(/* percorso */) {
  return { pulito: true };
}
