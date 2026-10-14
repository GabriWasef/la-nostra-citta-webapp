// Verifica di autenticità di una foto: deterministica, senza modelli linguistici, nell'ordine:
//  a. coerenza tra posizione GPS della foto (EXIF) e posizione della segnalazione;
//  b. foto già usata in altre segnalazioni (hash percettivo);
//  c. segnale del modello "sembra generata o montata", solo come indizio a peso basso.
// Non produce mai BLOCCATO: un sospetto di falsità si segnala al comitato, non si sanziona.
import { CONFIDENZA_SEGNALE_AUTENTICITA } from './esito.js';

export const MODELLO_AUTENTICITA = 'verifica-autenticita@1';
const RAGGIO_TERRA_M = 6_371_000;

/** Distanza in metri tra due punti (formula dell'emisenoverso). */
export function distanzaMetri(lat1, lon1, lat2, lon2) {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAGGIO_TERRA_M * Math.asin(Math.sqrt(a));
}

const numero = (v) => (v === null || v === undefined ? null : Number(v));

/**
 * @param {object} dati
 * @param {{latitudine_exif, longitudine_exif, hash_percettivo, data_scatto_exif}} dati.allegato
 * @param {{latitudine, longitudine, origine_coordinate, data_inserimento}} dati.segnalazione
 * @param {{id_allegato, id_segnalazione, distanza}[]} dati.simili allegati di altre segnalazioni con pHash vicino
 * @param {object|null} dati.pertinenza ultima analisi VERIFICA_PERTINENZA dell'allegato (se c'è)
 * @param {number} dati.distanzaMassimaM soglia EXIF_MAX_DISTANCE_M
 * @returns {{esito: 'OK'|'DA_REVISIONARE', punteggio: number, risultato: object}}
 */
export function verificaAutenticita({ allegato, segnalazione, simili, pertinenza, distanzaMassimaM }) {
  const motivi = [];
  let punteggio = 0;

  // a. Posizione EXIF. Senza metadati il controllo è "non verificabile": non è un errore né un indizio.
  const latFoto = numero(allegato.latitudine_exif);
  const lonFoto = numero(allegato.longitudine_exif);
  const latSeg = numero(segnalazione.latitudine);
  const lonSeg = numero(segnalazione.longitudine);
  let exif;
  if (latFoto === null || lonFoto === null) {
    exif = { stato: 'NON_VERIFICABILE', nota: 'La foto non contiene la posizione GPS.' };
  } else if (latSeg === null || lonSeg === null) {
    exif = { stato: 'NON_VERIFICABILE', nota: 'La segnalazione non ha una posizione.' };
  } else {
    const distanza = Math.round(distanzaMetri(latFoto, lonFoto, latSeg, lonSeg));
    const coerente = distanza <= distanzaMassimaM;
    exif = { stato: coerente ? 'COERENTE' : 'INCOERENTE', distanza_m: distanza, soglia_m: distanzaMassimaM };
    // Se la posizione è stata presa proprio dalla foto, la coerenza non dice nulla.
    if (segnalazione.origine_coordinate === 'EXIF') exif.nota = 'Posizione della segnalazione ricavata dalle foto.';
    if (!coerente) {
      motivi.push('EXIF_POSIZIONE_LONTANA');
      punteggio += 0.5;
    }
  }
  if (allegato.data_scatto_exif) {
    const scatto = new Date(allegato.data_scatto_exif);
    exif.data_scatto = scatto.toISOString();
    if (segnalazione.data_inserimento) {
      // Solo informativo: una foto vecchia può essere legittima (problema che dura da tempo).
      exif.giorni_prima_dell_invio = Math.floor((new Date(segnalazione.data_inserimento) - scatto) / 86_400_000);
    }
  }

  // b. Foto già usata in altre segnalazioni.
  let duplicati;
  if (!allegato.hash_percettivo) {
    duplicati = { stato: 'NON_VERIFICABILE', nota: 'Immagine troppo uniforme per un confronto affidabile.' };
  } else if (simili.length) {
    const precedenti = [...new Set(simili.map((s) => s.id_segnalazione))];
    duplicati = {
      stato: 'TROVATI',
      id_segnalazione_precedente: precedenti[0],
      segnalazioni: precedenti,
      allegati: simili.map((s) => ({ id_allegato: s.id_allegato, id_segnalazione: s.id_segnalazione, distanza: s.distanza })),
    };
    motivi.push('FOTO_GIA_USATA');
    punteggio += 0.6;
  } else {
    duplicati = { stato: 'NESSUNO' };
  }

  // c. Segnale del modello: peso basso, da solo non cambia l'esito.
  let segnaleModello;
  const s = pertinenza?.risultato?.segnale_autenticita;
  if (!s) {
    segnaleModello = { stato: 'NON_DISPONIBILE' };
  } else {
    const rilevante = s.sembra_generata_o_montata && s.confidenza >= CONFIDENZA_SEGNALE_AUTENTICITA;
    segnaleModello = { stato: rilevante ? 'SOSPETTO' : 'NESSUN_SOSPETTO', ...s, modello: pertinenza.modello };
    if (rilevante) punteggio += 0.15 * s.confidenza;
  }

  const esito = motivi.length ? 'DA_REVISIONARE' : 'OK';
  if (esito === 'DA_REVISIONARE' && segnaleModello.stato === 'SOSPETTO') motivi.push('SEGNALE_MODELLO');
  return {
    esito,
    punteggio: Number(Math.min(1, punteggio).toFixed(4)),
    risultato: { exif, duplicati, segnale_modello: segnaleModello, motivi_esito: motivi },
  };
}
