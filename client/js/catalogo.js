// Dati di riferimento (quartieri, categorie, stati), caricati una volta per pagina.
import { api } from './api.js';

const cache = {};
const carica = (chiave, percorso) => (cache[chiave] ??= api.get(percorso).then((r) => r.dati));

export const quartieri = () => carica('quartieri', '/quartieri');
export const categorie = () => carica('categorie', '/categorie');
export const stati = () => carica('stati', '/stati');
export const statiPubblici = async () => (await stati()).filter((s) => s.pubblica);
