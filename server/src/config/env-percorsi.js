// Percorsi del progetto, senza leggere né validare le variabili d'ambiente:
// servono anche agli script di build, che girano senza database né segreti.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
