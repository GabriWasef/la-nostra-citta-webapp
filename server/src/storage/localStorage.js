import fs from 'node:fs/promises';
import path from 'node:path';

// Chiavi generate solo dal server: anno/mese/uuid.estensione
const CHIAVE_VALIDA = /^\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov|webm)$/;

/**
 * Archivio dei file su filesystem locale (sviluppo o server singolo).
 * Stessa interfaccia di un futuro archivio S3-compatibile:
 * saveFile, saveBuffer, remove, send.
 */
export function createLocalStorage(baseDir) {
  const percorso = (chiave) => {
    if (!CHIAVE_VALIDA.test(chiave)) throw new Error(`Chiave di archiviazione non valida: ${chiave}`);
    return path.join(baseDir, chiave);
  };

  return {
    tipo: 'locale',

    async saveBuffer(chiave, buffer) {
      const dest = percorso(chiave);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, buffer, { flag: 'wx' });
    },

    async saveFile(chiave, sorgente) {
      const dest = percorso(chiave);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      // copyFile + rm invece di rename: la cartella temporanea può stare su un altro disco.
      await fs.copyFile(sorgente, dest, fs.constants.COPYFILE_EXCL);
      await fs.rm(sorgente, { force: true });
    },

    async remove(chiave) {
      await fs.rm(percorso(chiave), { force: true });
    },

    /** Invia il file al client; sendFile gestisce le richieste Range necessarie ai video. */
    send(res, chiave, { tipoMime, nomeFile }) {
      return new Promise((resolve, reject) => {
        res.sendFile(
          chiave,
          {
            root: baseDir,
            dotfiles: 'deny',
            headers: {
              'Content-Type': tipoMime,
              'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(nomeFile)}`,
              'Cache-Control': 'private, max-age=3600',
            },
          },
          (err) => (err ? reject(err) : resolve()),
        );
      });
    },
  };
}
