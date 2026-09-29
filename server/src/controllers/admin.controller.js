import { listOperazioni } from '../repositories/sicurezza.repository.js';
import * as utenteService from '../services/utente.service.js';
import { audit } from '../utils/audit.js';

const pagine = (totale, perPagina) => Math.max(1, Math.ceil(totale / perPagina));

export async function utenti(req, res) {
  const filtri = req.valid.query;
  const { righe, totale } = await utenteService.cercaUtenti(filtri);
  res.json({ dati: righe, paginazione: { pagina: filtri.pagina, perPagina: filtri.perPagina, totale, pagine: pagine(totale, filtri.perPagina) } });
}

export async function aggiornaUtente(req, res) {
  const { prima, dopo } = await utenteService.aggiornaUtente(req.valid.params.id, req.valid.body, req.user);
  await audit(req, 'UTENTE_MODIFICATO', 'utente', dopo.id_utente, {
    ruolo: [prima.ruolo, dopo.ruolo],
    stato_account: [prima.stato_account, dopo.stato_account],
  });
  res.json({ utente: dopo });
}

export async function log(req, res) {
  const filtri = req.valid.query;
  const { righe, totale } = await listOperazioni(filtri);
  res.json({ dati: righe, paginazione: { pagina: filtri.pagina, perPagina: filtri.perPagina, totale, pagine: pagine(totale, filtri.perPagina) } });
}
