import * as catalogoService from '../services/catalogo.service.js';
import { audit } from '../utils/audit.js';

export const listQuartieri = async (req, res) => res.json({ dati: await catalogoService.listQuartieri() });
export const listCategorie = async (req, res) => res.json({ dati: await catalogoService.listCategorie() });
export const listStati = async (req, res) => res.json({ dati: await catalogoService.listStati() });
export const statistiche = async (req, res) => res.json(await catalogoService.statistiche());

// ---- Amministrazione

export async function creaQuartiere(req, res) {
  const quartiere = await catalogoService.creaQuartiere(req.valid.body);
  await audit(req, 'QUARTIERE_CREATO', 'quartiere', quartiere.id_quartiere, req.valid.body);
  res.status(201).json({ quartiere });
}

export async function aggiornaQuartiere(req, res) {
  const quartiere = await catalogoService.aggiornaQuartiere(req.valid.params.id, req.valid.body);
  await audit(req, 'QUARTIERE_AGGIORNATO', 'quartiere', quartiere.id_quartiere, req.valid.body);
  res.json({ quartiere });
}

export async function eliminaQuartiere(req, res) {
  await catalogoService.eliminaQuartiere(req.valid.params.id);
  await audit(req, 'QUARTIERE_ELIMINATO', 'quartiere', req.valid.params.id);
  res.status(204).end();
}

export async function creaCategoria(req, res) {
  const categoria = await catalogoService.creaCategoria(req.valid.body);
  await audit(req, 'CATEGORIA_CREATA', 'categoria', categoria.id_categoria, req.valid.body);
  res.status(201).json({ categoria });
}

export async function aggiornaCategoria(req, res) {
  const categoria = await catalogoService.aggiornaCategoria(req.valid.params.id, req.valid.body);
  await audit(req, 'CATEGORIA_AGGIORNATA', 'categoria', categoria.id_categoria, req.valid.body);
  res.json({ categoria });
}

export async function eliminaCategoria(req, res) {
  await catalogoService.eliminaCategoria(req.valid.params.id);
  await audit(req, 'CATEGORIA_ELIMINATA', 'categoria', req.valid.params.id);
  res.status(204).end();
}

export async function aggiornaStato(req, res) {
  const stato = await catalogoService.aggiornaStato(req.valid.params.id, req.valid.body);
  await audit(req, 'STATO_AGGIORNATO', 'stato_segnalazione', req.valid.params.id, req.valid.body);
  res.json({ stato });
}
