import { env } from '../config/env.js';
import { createLocalStorage } from './localStorage.js';

// In produzione si potrà sostituire con un archivio S3-compatibile
// che esponga la stessa interfaccia.
export const storage = createLocalStorage(env.uploadDir);

/**
 * Punto di aggancio per l'antivirus (es. ClamAV via clamd) in produzione.
 * In sviluppo non esegue controlli.
 * @returns {Promise<{pulito: boolean, motivo?: string}>}
 */
export async function scansionaFile(/* percorso */) {
  return { pulito: true };
}
