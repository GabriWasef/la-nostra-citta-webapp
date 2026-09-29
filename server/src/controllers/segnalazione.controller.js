import { pulisciTemporanei } from '../middlewares/upload.js';
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
  try {
    const esito = await segnalazioneService.crea(req.valid.body, req.files, req.user);
    await audit(req, 'SEGNALAZIONE_CREATA', 'segnalazione', esito.id_segnalazione, {
      allegati: req.files.length,
      moderazione: esito.moderazione,
    });
    const segnalazione = await segnalazioneService.dettaglio(esito.id_segnalazione, req.user);
    res.status(201).json({ segnalazione, categorie_suggerite: esito.categorie_suggerite });
  } catch (err) {
    if (err.code === 'CONTENUTO_NON_AMMESSO') await audit(req, 'SEGNALAZIONE_BLOCCATA_IA', 'segnalazione');
    throw err;
  } finally {
    await pulisciTemporanei(req);
  }
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
