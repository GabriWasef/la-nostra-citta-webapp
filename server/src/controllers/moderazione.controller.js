import * as segnalazioneService from '../services/segnalazione.service.js';
import { audit } from '../utils/audit.js';

export const coda = async (req, res) => res.json(await segnalazioneService.elencoModerazione(req.valid.query, req.user));

export async function cambiaStato(req, res) {
  const id = req.valid.params.id;
  const esito = await segnalazioneService.cambiaStato(id, req.valid.body, req.user);
  await audit(req, 'STATO_CAMBIATO', 'segnalazione', id, { ...esito, motivazione: req.valid.body.motivazione ?? null });
  res.json({ segnalazione: await segnalazioneService.dettaglio(id, req.user) });
}

export async function impostaCategorie(req, res) {
  const id = req.valid.params.id;
  const esito = await segnalazioneService.impostaCategorie(id, req.valid.body.categorie, req.user);
  await audit(req, 'CATEGORIE_MODIFICATE', 'segnalazione', id, esito);
  res.json({ segnalazione: await segnalazioneService.dettaglio(id, req.user) });
}

export async function nascondi(req, res) {
  const id = req.valid.params.id;
  const esito = await segnalazioneService.nascondi(id, req.valid.body.motivazione);
  await audit(req, 'SEGNALAZIONE_NASCOSTA', 'segnalazione', id, { ...esito, motivazione: req.valid.body.motivazione });
  res.json({ segnalazione: await segnalazioneService.dettaglio(id, req.user) });
}

export async function mostra(req, res) {
  const id = req.valid.params.id;
  const esito = await segnalazioneService.mostra(id);
  await audit(req, 'SEGNALAZIONE_RIPRISTINATA', 'segnalazione', id, esito);
  res.json({ segnalazione: await segnalazioneService.dettaglio(id, req.user) });
}

export async function elimina(req, res) {
  const id = req.valid.params.id;
  const esito = await segnalazioneService.eliminaSegnalazione(id);
  await audit(req, 'SEGNALAZIONE_ELIMINATA', 'segnalazione', id, { ...esito, motivazione: req.valid.body.motivazione });
  res.status(204).end();
}

export const analisi = async (req, res) => res.json({ dati: await segnalazioneService.analisi(req.valid.params.id) });

export async function revisionaAnalisi(req, res) {
  const a = await segnalazioneService.revisionaAnalisi(req.valid.params.id, req.valid.body.esito_revisione, req.user);
  await audit(req, 'ANALISI_IA_REVISIONATA', 'analisi_ia', a.id_analisi, req.valid.body);
  res.json({ dati: await segnalazioneService.analisi(a.id_segnalazione) });
}

export async function eliminaAllegato(req, res) {
  const allegato = await segnalazioneService.eliminaAllegato(req.valid.params.id);
  await audit(req, 'ALLEGATO_ELIMINATO', 'allegato', allegato.id_allegato, { id_segnalazione: allegato.id_segnalazione });
  res.status(204).end();
}
