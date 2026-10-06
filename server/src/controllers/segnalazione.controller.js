import { avviaAnalisiDopoRisposta } from '../ai/worker.js';
import { pulisciTemporanei } from '../middlewares/upload.js';
import { eliminaAllegatiTemporanei, scaricaAllegatiDiretti } from '../services/media.service.js';
import * as segnalazioneService from '../services/segnalazione.service.js';
import { audit } from '../utils/audit.js';

export const elenco = async (req, res) => res.json(await segnalazioneService.elencoPubblico(req.valid.query, req.user));
export const mie = async (req, res) => res.json(await segnalazioneService.elencoMie(req.valid.query, req.user));
export const mappa = async (req, res) => res.json({ dati: await segnalazioneService.perMappa(req.valid.query) });
export const classifica = async (req, res) => res.json({ dati: await segnalazioneService.classifica(req.valid.query) });
export const dettaglio = async (req, res) =>
  res.json({ segnalazione: await segnalazioneService.dettaglio(req.valid.params.id, req.user) });
export const storico = async (req, res) =>
  res.json({ dati: await segnalazioneService.storico(req.valid.params.id, req.user) });

export async function crea(req, res) {
  const dati = req.valid.body;
  let temporanei = [];
  let risposta;
  try {
    // Due modi di inviare gli allegati: nel modulo (file in req.files) oppure già caricati
    // dal browser sull'archivio (allegati_blob), come su Vercel, dove una richiesta non può superare 4,5 MB.
    if (dati.allegati_blob.length) {
      const diretti = await scaricaAllegatiDiretti(dati.allegati_blob, req.user);
      req.files = diretti.files; // verranno eliminati da pulisciTemporanei
      temporanei = diretti.temporanei;
    }
    const esito = await segnalazioneService.crea(dati, req.files ?? [], req.user);
    await audit(req, 'SEGNALAZIONE_CREATA', 'segnalazione', esito.id_segnalazione, {
      allegati: req.files?.length ?? 0,
      moderazione: esito.moderazione,
    });
    // Su Vercel non c'è un worker in sottofondo: le analisi in coda partono dopo la risposta.
    avviaAnalisiDopoRisposta();
    const segnalazione = await segnalazioneService.dettaglio(esito.id_segnalazione, req.user);
    risposta = { segnalazione, categorie_suggerite: esito.categorie_suggerite };
  } catch (err) {
    if (err.code === 'CONTENUTO_NON_AMMESSO') await audit(req, 'SEGNALAZIONE_BLOCCATA_IA', 'segnalazione');
    throw err;
  } finally {
    await pulisciTemporanei(req);
    await eliminaAllegatiTemporanei(temporanei);
  }
  // Si risponde solo a pulizia finita: su Vercel dopo la risposta la funzione può essere sospesa.
  res.status(201).json(risposta);
}

export async function sostieni(req, res) {
  const esito = await segnalazioneService.sostieni(req.valid.params.id, req.user);
  res.status(201).json(esito);
}

export async function revocaSostegno(req, res) {
  res.json(await segnalazioneService.revocaSostegno(req.valid.params.id, req.user));
}

export async function allegato(req, res) {
  const allegato = await segnalazioneService.allegatoVisibile(req.valid.params.id, req.user);
  await segnalazioneService.inviaAllegato(res, allegato);
}
