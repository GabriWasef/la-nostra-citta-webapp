import { provider } from '../ai/index.js';
import { conOperatore, withTransaction } from '../config/db.js';
import { isModeratore } from '../middlewares/auth.js';
import * as allegatoRepository from '../repositories/allegato.repository.js';
import * as analisiRepository from '../repositories/analisi.repository.js';
import * as catalogoRepository from '../repositories/catalogo.repository.js';
import * as segnalazioneRepository from '../repositories/segnalazione.repository.js';
import * as sostegnoRepository from '../repositories/sostegno.repository.js';
import { storage } from '../storage/index.js';
import { AppError, nonTrovato } from '../utils/AppError.js';
import { STATO_INIZIALE, transizioneAmmessa } from './cicloVita.js';
import * as mediaService from './media.service.js';

const NON_TROVATA = () => nonTrovato('Segnalazione');

// ---- Regole di accesso

const eAutore = (s, utente) => Boolean(utente) && s.id_autore === utente.id_utente;

/** Pubblica e non privata: chiunque. Altrimenti solo autore e comitato. */
export function puoVedere(s, utente) {
  return (s.pubblica && s.visibilita !== 'PRIVATA') || eAutore(s, utente) || isModeratore(utente);
}

/** Rappresentazione JSON esposta dall'API, filtrata in base a chi guarda. */
function presenta(s, utente, { categorie = [], copertina = null } = {}) {
  const moderatore = isModeratore(utente);
  const mostraAutore = s.visibilita !== 'ANONIMA' || moderatore || eAutore(s, utente);
  return {
    id_segnalazione: s.id_segnalazione,
    titolo: s.titolo,
    descrizione: s.descrizione,
    data_inserimento: s.data_inserimento,
    data_aggiornamento: s.data_aggiornamento,
    latitudine: s.latitudine,
    longitudine: s.longitudine,
    origine_coordinate: s.origine_coordinate,
    indirizzo: s.indirizzo,
    visibilita: s.visibilita,
    quartiere: { id_quartiere: s.id_quartiere, nome: s.quartiere },
    stato: { id_stato: s.id_stato, codice: s.codice_stato, nome: s.stato, pubblica: s.pubblica, finale: s.finale },
    autore: mostraAutore ? { nome: s.nome_autore, ...(moderatore ? { id_utente: s.id_autore } : {}) } : null,
    e_mia: eAutore(s, utente),
    numero_sostegni: s.numero_sostegni,
    sostenuta: s.sostenuta,
    categorie,
    copertina,
    ...(moderatore ? { da_revisionare_ia: s.da_revisionare_ia } : {}),
  };
}

async function presentaElenco({ righe, totale }, filtri, utente) {
  const ids = righe.map((r) => r.id_segnalazione);
  const [categorie, copertine] = await Promise.all([
    segnalazioneRepository.categoriePer(ids),
    segnalazioneRepository.copertinePer(ids),
  ]);
  return {
    dati: righe.map((r) =>
      presenta(r, utente, { categorie: categorie.get(r.id_segnalazione), copertina: copertine.get(r.id_segnalazione) ?? null }),
    ),
    paginazione: {
      pagina: filtri.pagina,
      perPagina: filtri.perPagina,
      totale,
      pagine: Math.max(1, Math.ceil(totale / filtri.perPagina)),
    },
  };
}

// ---- Consultazione (RF08)

/**
 * Elenco delle segnalazioni: tutti vedono quelle pubblicate; chi è collegato vede anche le proprie
 * (anche in attesa di approvazione); il comitato (moderatori e amministratori) le vede tutte.
 */
export async function elencoPubblico(filtri, utente) {
  const ambito = isModeratore(utente) ? { tipo: 'moderazione' } : { tipo: 'pubblico', idUtente: utente?.id_utente };
  const risultato = await segnalazioneRepository.cerca(filtri, ambito, utente?.id_utente);
  return presentaElenco(risultato, filtri, utente);
}

export async function elencoMie(filtri, utente) {
  const risultato = await segnalazioneRepository.cerca(filtri, { tipo: 'autore', idUtente: utente.id_utente }, utente.id_utente);
  return presentaElenco(risultato, filtri, utente);
}

export async function elencoModerazione(filtri, utente) {
  const risultato = await segnalazioneRepository.cerca(filtri, { tipo: 'moderazione' }, utente.id_utente);
  return presentaElenco(risultato, filtri, utente);
}

/** Punti per la mappa: solo segnalazioni pubbliche con coordinate. */
export async function perMappa(filtri) {
  const { righe } = await segnalazioneRepository.cerca(
    { ...filtri, soloConCoordinate: true, ordina: 'recenti', pagina: 1, perPagina: 1000 },
    { tipo: 'pubblico' },
  );
  const copertine = await segnalazioneRepository.copertinePer(righe.map((r) => r.id_segnalazione));
  return righe.map((r) => ({
    id_segnalazione: r.id_segnalazione,
    titolo: r.titolo,
    latitudine: r.latitudine,
    longitudine: r.longitudine,
    indirizzo: r.indirizzo,
    quartiere: r.quartiere,
    stato: { codice: r.codice_stato, nome: r.stato },
    numero_sostegni: r.numero_sostegni,
    copertina: copertine.get(r.id_segnalazione) ?? null,
  }));
}

export async function classifica(filtri) {
  const { righe, totale } = await segnalazioneRepository.classifica(filtri);
  return {
    dati: righe,
    paginazione: { pagina: filtri.pagina, perPagina: filtri.limite, totale, pagine: Math.max(1, Math.ceil(totale / filtri.limite)) },
  };
}

async function caricaVisibile(id, utente) {
  const s = await segnalazioneRepository.findById(id, utente?.id_utente ?? null);
  // 404 anche quando esiste ma non è visibile: non si rivela l'esistenza di segnalazioni private.
  if (!s || !puoVedere(s, utente)) throw NON_TROVATA();
  return s;
}

export async function dettaglio(id, utente) {
  const s = await caricaVisibile(id, utente);
  const [categorie, allegati] = await Promise.all([
    segnalazioneRepository.categoriePer([id]),
    allegatoRepository.listBySegnalazione(id),
  ]);
  const moderatore = isModeratore(utente);
  return {
    ...presenta(s, utente, { categorie: categorie.get(id) }),
    // Le coordinate EXIF possono rivelare una posizione precisa: solo per il comitato.
    allegati: allegati.map(({ latitudine_exif, longitudine_exif, ...a }) => ({
      ...a,
      url: `/api/v1/allegati/${a.id_allegato}`,
      ...(moderatore ? { latitudine_exif, longitudine_exif } : {}),
    })),
  };
}

export async function storico(id, utente) {
  await caricaVisibile(id, utente);
  const righe = await segnalazioneRepository.storico(id);
  const moderatore = isModeratore(utente);
  // L'identità dell'operatore è visibile solo al comitato; il pubblico vede il ruolo.
  return righe.map(({ id_utente_operatore, operatore, ruolo_operatore, ...r }) => ({
    ...r,
    operatore: moderatore ? operatore : ruolo_operatore === 'CITTADINO' ? 'Autore' : ruolo_operatore ? 'Comitato' : null,
  }));
}

// ---- Inserimento (RF05, RF06, RF07, RF11-RF14)

/**
 * Crea la segnalazione con allegati e categorie in un'unica transazione.
 * Se qualcosa fallisce, i file già salvati vengono eliminati.
 */
export async function crea(dati, files, autore) {
  if (!files?.length) {
    throw new AppError(400, 'ALLEGATO_OBBLIGATORIO', 'Allega almeno una foto o un breve video che documenti il problema.', [
      { campo: 'allegati', messaggio: 'Allega almeno una foto o un video.' },
    ]);
  }

  const [quartiere, categorieDb, statoIniziale] = await Promise.all([
    catalogoRepository.findQuartiere(dati.id_quartiere),
    catalogoRepository.listCategorie(),
    catalogoRepository.findStatoByCodice(STATO_INIZIALE),
  ]);
  if (!quartiere) {
    throw new AppError(422, 'QUARTIERE_NON_VALIDO', 'Il quartiere indicato non esiste.', [
      { campo: 'id_quartiere', messaggio: 'Quartiere non valido.' },
    ]);
  }
  const idCategorie = new Set(categorieDb.map((c) => c.id_categoria));
  if (dati.categorie.some((id) => !idCategorie.has(id))) {
    throw new AppError(422, 'CATEGORIA_NON_VALIDA', 'Una delle categorie indicate non esiste.', [
      { campo: 'categorie', messaggio: 'Categoria non valida.' },
    ]);
  }

  // Moderazione automatica in tempo reale, prima di salvare qualsiasi cosa.
  const testo = `${dati.titolo}\n${dati.descrizione}`;
  const moderazione = provider.moderazione ? await provider.moderazione.analizza(testo) : null;
  if (moderazione?.esito === 'BLOCCATO') {
    throw new AppError(
      422,
      'CONTENUTO_NON_AMMESSO',
      'Il testo contiene espressioni non ammesse (minacce o linguaggio d’odio). Riformula la segnalazione.',
    );
  }
  const suggerite = provider.classificazione ? await provider.classificazione.classifica(testo, categorieDb) : [];

  const chiaviSalvate = [];
  try {
    const media = [];
    for (const file of files) {
      const m = await mediaService.elaboraFile(file);
      chiaviSalvate.push(m.chiave);
      media.push(m);
    }

    // Posizione: dall'utente (mappa o coordinate) oppure, se autorizzato, dai metadati GPS della foto.
    let { latitudine, longitudine } = dati;
    let origine = latitudine !== null ? dati.origine_coordinate : null;
    const conGps = media.find((m) => m.latitudine_exif !== null);
    if (latitudine === null && dati.usa_posizione_foto && conGps) {
      latitudine = conGps.latitudine_exif;
      longitudine = conGps.longitudine_exif;
      origine = 'EXIF';
    }

    // Se il cittadino non sceglie categorie, si usano quelle proposte dall'IA (da confermare in moderazione).
    const categorie = dati.categorie.length
      ? dati.categorie.map((id) => ({ id_categoria: id }))
      : suggerite.map((c) => ({ id_categoria: c.id_categoria, origine: 'IA', affidabilita: c.affidabilita }));

    return await withTransaction(async (conn) => {
      const id = await segnalazioneRepository.insert(
        {
          ...dati,
          latitudine,
          longitudine,
          origine_coordinate: origine,
          id_autore: autore.id_utente,
          id_stato: statoIniziale.id_stato,
        },
        conn,
      );

      for (const m of media) {
        m.id_allegato = await allegatoRepository.insert({ ...m, percorso_file: m.chiave, id_segnalazione: id }, conn);
      }
      await segnalazioneRepository.aggiungiCategorie(id, categorie, conn);

      if (moderazione) {
        await analisiRepository.insert(
          {
            tipo_analisi: 'MODERAZIONE_TESTO',
            modello: provider.moderazione.modello,
            risultato: moderazione,
            punteggio: moderazione.punteggio,
            esito: moderazione.esito,
            id_segnalazione: id,
          },
          conn,
        );
      }
      if (provider.classificazione) {
        await analisiRepository.insert(
          {
            tipo_analisi: 'CLASSIFICAZIONE_TESTO',
            modello: provider.classificazione.modello,
            risultato: { suggerite, scelte_dal_cittadino: dati.categorie },
            punteggio: suggerite[0]?.affidabilita ?? null,
            esito: dati.categorie.length ? 'OK' : 'DA_REVISIONARE',
            id_segnalazione: id,
          },
          conn,
        );
      }
      for (const m of media.filter((x) => x.tipo_media === 'IMMAGINE')) {
        await analisiRepository.insert(
          {
            tipo_analisi: 'ESTRAZIONE_EXIF',
            modello: 'exifr',
            risultato: {
              gps_presente: m.latitudine_exif !== null,
              latitudine: m.latitudine_exif,
              longitudine: m.longitudine_exif,
              usata_per_la_posizione: origine === 'EXIF' && m === conGps,
              metadati_rimossi_dal_file_pubblicato: true,
            },
            esito: 'OK',
            id_allegato: m.id_allegato,
          },
          conn,
        );
        if (provider.visione) {
          await analisiRepository.accoda({ tipo_analisi: 'ANALISI_IMMAGINE', id_segnalazione: id, id_allegato: m.id_allegato }, conn);
        }
      }
      return { id_segnalazione: id, moderazione: moderazione?.esito ?? null, categorie_suggerite: suggerite };
    });
  } catch (err) {
    await mediaService.eliminaFile(chiaviSalvate);
    throw err;
  }
}

// ---- Sostegno (RF09)

export async function sostieni(id, utente) {
  const s = await segnalazioneRepository.findAccesso(id);
  if (!s || !puoVedere(s, utente)) throw NON_TROVATA();
  if (eAutore(s, utente)) {
    throw new AppError(403, 'AUTOSOSTEGNO', 'Non puoi sostenere la tua segnalazione.');
  }
  if (!s.pubblica || s.visibilita === 'PRIVATA') {
    throw new AppError(422, 'NON_SOSTENIBILE', 'Si possono sostenere solo segnalazioni pubblicate.');
  }
  try {
    await sostegnoRepository.insert(utente.id_utente, id);
  } catch (err) {
    if (err.errno === 1062) throw new AppError(409, 'SOSTEGNO_DUPLICATO', 'Hai già sostenuto questa segnalazione.');
    throw err;
  }
  return { sostenuta: true, numero_sostegni: await sostegnoRepository.conta(id) };
}

export async function revocaSostegno(id, utente) {
  const s = await segnalazioneRepository.findAccesso(id);
  if (!s || !puoVedere(s, utente)) throw NON_TROVATA();
  const rimossi = await sostegnoRepository.remove(utente.id_utente, id);
  if (!rimossi) throw new AppError(404, 'SOSTEGNO_NON_TROVATO', 'Non avevi sostenuto questa segnalazione.');
  return { sostenuta: false, numero_sostegni: await sostegnoRepository.conta(id) };
}

// ---- Moderazione (RF10, RF12)

export async function cambiaStato(id, { codice, motivazione }, operatore) {
  const s = await segnalazioneRepository.findAccesso(id);
  if (!s) throw NON_TROVATA();
  const nuovo = await catalogoRepository.findStatoByCodice(codice);
  if (!nuovo) throw new AppError(422, 'STATO_NON_VALIDO', 'Lo stato indicato non esiste.');
  if (!transizioneAmmessa(s.codice_stato, codice)) {
    throw new AppError(422, 'TRANSIZIONE_NON_AMMESSA', `La segnalazione non può passare da "${s.stato}" a "${nuovo.nome}".`);
  }

  await withTransaction((conn) =>
    conOperatore(conn, operatore.id_utente, motivazione ?? null, async () => {
      // I trigger verificano allegato e categoria se il nuovo stato è pubblico.
      await segnalazioneRepository.updateStato(id, nuovo.id_stato, conn);
      // La decisione del moderatore chiude le revisioni IA ancora aperte.
      if (codice === 'APPROVATA' || codice === 'RIFIUTATA') {
        const esitoModerazione = codice === 'APPROVATA' ? 'RESPINTA' : 'CONFERMATA';
        await analisiRepository.revisionaPendenti(id, 'MODERAZIONE_TESTO', esitoModerazione, operatore.id_utente, conn);
      }
      if (codice === 'APPROVATA') {
        await analisiRepository.revisionaPendenti(id, 'CLASSIFICAZIONE_TESTO', 'CONFERMATA', operatore.id_utente, conn);
      }
    }),
  );
  return { da: s.codice_stato, a: codice };
}

export async function impostaCategorie(id, idCategorie, moderatore) {
  const s = await segnalazioneRepository.findAccesso(id);
  if (!s) throw NON_TROVATA();
  return withTransaction(async (conn) => {
    const attuali = (await segnalazioneRepository.categoriePer([id], conn)).get(id).map((c) => c.id_categoria);
    const nuove = idCategorie.filter((c) => !attuali.includes(c));
    const rimosse = attuali.filter((c) => !idCategorie.includes(c));
    // Prima si aggiungono, poi si rimuovono: una segnalazione pubblicata non resta mai senza categorie.
    await segnalazioneRepository.aggiungiCategorie(id, nuove.map((c) => ({ id_categoria: c })), conn);
    await segnalazioneRepository.rimuoviCategorie(id, rimosse, conn);
    const esito = nuove.length || rimosse.length ? 'CORRETTA' : 'CONFERMATA';
    await analisiRepository.revisionaPendenti(id, 'CLASSIFICAZIONE_TESTO', esito, moderatore.id_utente, conn);
    return { aggiunte: nuove, rimosse };
  });
}

export async function analisi(id) {
  const s = await segnalazioneRepository.findAccesso(id);
  if (!s) throw NON_TROVATA();
  return analisiRepository.listBySegnalazione(id);
}

export async function revisionaAnalisi(idAnalisi, esito, moderatore) {
  const a = await analisiRepository.findById(idAnalisi);
  if (!a) throw nonTrovato('Analisi');
  await analisiRepository.revisiona(idAnalisi, esito, moderatore.id_utente);
  return a;
}

export async function eliminaAllegato(idAllegato) {
  const allegato = await allegatoRepository.findById(idAllegato);
  if (!allegato) throw nonTrovato('Allegato');
  await allegatoRepository.remove(idAllegato); // il trigger impedisce di togliere l'unico allegato di una segnalazione pubblicata
  await mediaService.eliminaFile([allegato.percorso_file]);
  return allegato;
}

// ---- Allegati

export async function allegatoVisibile(idAllegato, utente) {
  const allegato = await allegatoRepository.findById(idAllegato);
  if (!allegato) throw nonTrovato('Allegato');
  const s = await segnalazioneRepository.findAccesso(allegato.id_segnalazione);
  if (!s || !puoVedere(s, utente)) throw nonTrovato('Allegato');
  return allegato;
}

export const inviaAllegato = (res, allegato) =>
  storage.send(res, allegato.percorso_file, { tipoMime: allegato.tipo_mime, nomeFile: allegato.nome_file });
