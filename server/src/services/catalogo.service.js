import * as catalogoRepository from '../repositories/catalogo.repository.js';
import * as segnalazioneRepository from '../repositories/segnalazione.repository.js';
import { AppError, nonTrovato } from '../utils/AppError.js';
import { TRANSIZIONI } from './cicloVita.js';

function traduciErrore(err, cosa) {
  if (err.errno === 1062) return new AppError(409, 'NOME_GIA_USATO', `Esiste già ${cosa} con questo nome.`);
  if (err.errno === 1451) {
    return new AppError(409, 'IN_USO', `Non puoi eliminare ${cosa}: è collegato a segnalazioni esistenti.`);
  }
  return err;
}

async function conErrori(fn, cosa) {
  try {
    return await fn();
  } catch (err) {
    throw traduciErrore(err, cosa);
  }
}

// ---- Quartieri
export const listQuartieri = () => catalogoRepository.listQuartieri();

export async function creaQuartiere(dati) {
  const id = await conErrori(() => catalogoRepository.createQuartiere(dati), 'un quartiere');
  return catalogoRepository.findQuartiere(id);
}

export async function aggiornaQuartiere(id, dati) {
  if (!(await catalogoRepository.findQuartiere(id))) throw nonTrovato('Quartiere');
  await conErrori(() => catalogoRepository.updateQuartiere(id, dati), 'un quartiere');
  return catalogoRepository.findQuartiere(id);
}

export async function eliminaQuartiere(id) {
  const eliminati = await conErrori(() => catalogoRepository.deleteQuartiere(id), 'un quartiere');
  if (!eliminati) throw nonTrovato('Quartiere');
}

// ---- Categorie
export const listCategorie = () => catalogoRepository.listCategorie();

export async function creaCategoria(dati) {
  const id = await conErrori(() => catalogoRepository.createCategoria(dati), 'una categoria');
  return catalogoRepository.findCategoria(id);
}

export async function aggiornaCategoria(id, dati) {
  if (!(await catalogoRepository.findCategoria(id))) throw nonTrovato('Categoria');
  await conErrori(() => catalogoRepository.updateCategoria(id, dati), 'una categoria');
  return catalogoRepository.findCategoria(id);
}

export async function eliminaCategoria(id) {
  const eliminati = await conErrori(() => catalogoRepository.deleteCategoria(id), 'una categoria');
  if (!eliminati) throw nonTrovato('Categoria');
}

// ---- Stati (codici e regole sono fissi; nome e descrizione sono modificabili)
export async function listStati() {
  const stati = await catalogoRepository.listStati();
  return stati.map((s) => ({ ...s, transizioni: TRANSIZIONI[s.codice] ?? [] }));
}

export async function aggiornaStato(id, dati) {
  const aggiornati = await conErrori(() => catalogoRepository.updateStato(id, dati), 'uno stato');
  if (!aggiornati) throw nonTrovato('Stato');
  return (await listStati()).find((s) => s.id_stato === id);
}

export const statistiche = () => segnalazioneRepository.statistichePubbliche();
