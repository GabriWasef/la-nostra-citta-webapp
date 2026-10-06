// Archivio degli allegati su Vercel Blob, in modalità PRIVATA: nessun file ha un indirizzo
// pubblico. Il browser li scarica con un link firmato a scadenza breve, rilasciato dal server
// solo dopo il controllo di visibilità della segnalazione (GET /api/v1/allegati/:id).
//
// L'SDK è iniettabile (parametro "sdk") per poter provare la logica senza rete.
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as sdkVercel from '@vercel/blob';

// Chiavi definitive generate dal server: anno/mese/uuid.estensione
const CHIAVE_VALIDA = /^\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov|webm)$/;
// Oltre questa dimensione il file viene caricato a pezzi (più affidabile per i video).
const SOGLIA_MULTIPART = 10 * 1024 * 1024;
const DURATA_TOKEN_MS = 55 * 60 * 1000;

export function createBlobStorage({ sdk = sdkVercel, durataLinkMs = 15 * 60 * 1000, ora = () => Date.now() } = {}) {
  const verifica = (chiave) => {
    if (!CHIAVE_VALIDA.test(chiave)) throw new Error(`Chiave di archiviazione non valida: ${chiave}`);
    return chiave;
  };

  // Token di sola lettura valido per tutto l'archivio, tenuto in memoria e mai esposto:
  // serve solo a firmare i singoli link (la firma si calcola in locale, senza chiamate di rete).
  let tokenLettura = null;
  async function ottieniTokenLettura() {
    if (!tokenLettura || tokenLettura.scadenza - ora() < 60_000) {
      const validUntil = ora() + DURATA_TOKEN_MS;
      const token = await sdk.issueSignedToken({ pathname: '*', operations: ['get'], validUntil });
      tokenLettura = { token, scadenza: validUntil };
    }
    return tokenLettura.token;
  }

  async function urlFirmato(chiave) {
    verifica(chiave);
    const token = await ottieniTokenLettura();
    const { presignedUrl } = await sdk.presignUrl(token, {
      operation: 'get',
      pathname: chiave,
      access: 'private',
      validUntil: Math.min(ora() + durataLinkMs, tokenLettura.scadenza),
    });
    return presignedUrl;
  }

  return {
    tipo: 'blob',

    async saveBuffer(chiave, buffer, { tipoMime } = {}) {
      await sdk.put(verifica(chiave), buffer, {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: tipoMime,
      });
    },

    async saveFile(chiave, sorgente, { tipoMime } = {}) {
      const { size } = await fs.stat(sorgente);
      await sdk.put(verifica(chiave), createReadStream(sorgente), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: tipoMime,
        multipart: size > SOGLIA_MULTIPART,
      });
      await fs.rm(sorgente, { force: true });
    },

    async remove(chiave) {
      await sdk.del(verifica(chiave));
    },

    async leggi(chiave) {
      const risultato = await sdk.get(verifica(chiave), { access: 'private', useCache: false });
      if (!risultato || risultato.statusCode !== 200) throw new Error(`Allegato non trovato nell'archivio: ${chiave}`);
      return Buffer.from(await new Response(risultato.stream).arrayBuffer());
    },

    urlFirmato,

    /** Reindirizza il browser a un link firmato: i file non passano dalla funzione (limite di 4,5 MB). */
    async send(res, chiave) {
      const url = await urlFirmato(chiave);
      res.set('Cache-Control', 'private, no-store');
      res.redirect(302, url);
    },

    // ---- File temporanei del caricamento diretto dal browser ----

    prefissoTemporanei: (idUtente) => `tmp/${idUtente}/`,

    /** Scarica un file temporaneo su disco. Restituisce la dimensione dichiarata dall'archivio. */
    async scaricaTemporaneo(pathname, destinazione, { maxByte }) {
      const risultato = await sdk.get(pathname, { access: 'private', useCache: false });
      if (!risultato || risultato.statusCode !== 200) return null;
      const dimensione = Number(risultato.blob.size);
      if (dimensione > maxByte) {
        await risultato.stream.cancel().catch(() => {});
        return { dimensione, troppoGrande: true };
      }
      await pipeline(Readable.fromWeb(risultato.stream), createWriteStream(destinazione));
      return { dimensione, troppoGrande: false };
    },

    async rimuoviTemporanei(pathnames) {
      if (pathnames.length) await sdk.del(pathnames);
    },

    /** Elenca i file temporanei più vecchi di "oltreMs" (per la pulizia periodica). */
    async elencaTemporaneiVecchi(oltreMs) {
      const vecchi = [];
      let cursor;
      do {
        const pagina = await sdk.list({ prefix: 'tmp/', limit: 1000, cursor });
        for (const b of pagina.blobs) if (ora() - new Date(b.uploadedAt).getTime() > oltreMs) vecchi.push(b.pathname);
        cursor = pagina.hasMore ? pagina.cursor : undefined;
      } while (cursor);
      return vecchi;
    },
  };
}
