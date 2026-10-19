// Etichette delle analisi automatiche (IA), comuni al pannello di moderazione e al dettaglio.
import { h } from './dom.js';

export const MOTIVI = {
  // Motivi della moderazione automatica del testo (elenco chiuso del modello)
  MINACCIA: 'minaccia',
  ODIO: 'incitamento all’odio',
  INSULTO_GRAVE: 'insulto grave',
  CONTENUTO_SESSUALE: 'contenuto sessuale',
  SPAM_PUBBLICITA: 'spam o pubblicità',
  NON_SENSATA: 'testo privo di senso',
  NON_PERTINENTE: 'argomento non pertinente',
  DUBBIO: 'caso dubbio',
  // Filtro a regole e altre analisi
  LINGUAGGIO_VOLGARE: 'linguaggio volgare',
  INSULTI: 'insulti',
  LINGUAGGIO_ODIO: 'linguaggio d’odio',
  MINACCE: 'minacce',
  SPAM: 'possibile spam',
  TESTO_GRAVE: 'contenuto grave nel testo',
  TESTO_NON_ACCETTABILE: 'testo non accettabile',
  TESTO_DA_VERIFICARE: 'testo da verificare',
  ESITO_SUGGERITO_DAL_MODELLO: 'il modello suggerisce una verifica',
  CATEGORIE_DA_CONFERMARE: 'categorie da confermare',
  NESSUNA_CATEGORIA_SUGGERITA: 'nessuna categoria suggerita',
  CATEGORIA_DIVERSA_DAL_SUGGERIMENTO: 'categoria diversa da quella suggerita',
  IMMAGINE_INAPPROPRIATA: 'immagine inappropriata',
  IMMAGINE_NON_CORRISPONDE_AL_TESTO: 'l’immagine non corrisponde al testo',
  IMMAGINE_NON_CORRISPONDE_ALLA_CATEGORIA: 'l’immagine non corrisponde alla categoria',
  PERTINENZA_NON_VALUTABILE: 'pertinenza non valutabile',
  CONFIDENZA_BASSA: 'confidenza bassa',
  SEGNALE_AUTENTICITA: 'possibile immagine generata o ritoccata',
  SEGNALE_MODELLO: 'il modello sospetta un’immagine generata o ritoccata',
  EXIF_POSIZIONE_LONTANA: 'foto scattata lontano dal luogo indicato',
  FOTO_GIA_USATA: 'foto già usata in un’altra segnalazione',
  PROVIDER_NON_DISPONIBILE: 'servizio di analisi non disponibile',
  ANALISI_IN_CORSO: 'analisi ancora in corso',
  RISOLUZIONE_BASSA: 'risoluzione bassa',
  IMMAGINE_TROPPO_SCURA: 'immagine troppo scura',
  IMMAGINE_SOVRAESPOSTA: 'immagine sovraesposta',
};
export const motivo = (m) => MOTIVI[m] ?? String(m).toLowerCase().replaceAll('_', ' ');

const ETICHETTE_ESITO = { OK: 'OK', DA_REVISIONARE: 'Da revisionare', BLOCCATO: 'Bloccato' };
export const badgeEsito = (esito, prefisso = '') =>
  h('span', { class: `badge badge-esito esito-${esito.toLowerCase()}` }, `${prefisso}${ETICHETTE_ESITO[esito] ?? esito}`);

export const percentuale = (n) => `${Math.round(Number(n) * 100)}%`;

/** Motivazione delle segnalazioni nascoste dalla moderazione automatica: "AUTO_IA: <motivo>". */
export const PREFISSO_AUTO_IA = 'AUTO_IA: ';
export const motivoAutoIa = (motivazione) => motivo(String(motivazione ?? '').slice(PREFISSO_AUTO_IA.length));
