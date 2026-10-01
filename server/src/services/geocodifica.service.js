// Geocodifica (RF14): ricerca di un indirizzo e indirizzo di un punto sulla mappa,
// tramite Nominatim di OpenStreetMap. Le chiamate passano dal server per
// rispettare le regole d'uso del servizio (https://operations.osmfoundation.org/policies/nominatim/):
// User-Agent identificativo, al massimo una richiesta al secondo, risultati in cache.
import { env } from '../config/env.js';
import * as catalogoRepository from '../repositories/catalogo.repository.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

// Area di Milano (lon min, lat max, lon max, lat min) per limitare la ricerca.
const AREA_MILANO = '9.04,45.54,9.28,45.39';
const INTERVALLO_MS = 1100;
const DURATA_CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE = 500;

const cache = new Map();
let coda = Promise.resolve();
let ultimaChiamata = 0;

const ATTESA_DOPO_429_MS = 2000;

const nonDisponibile = () =>
  new AppError(503, 'GEOCODIFICA_NON_DISPONIBILE', 'La ricerca degli indirizzi non è disponibile in questo momento. Puoi scegliere il punto direttamente sulla mappa.');
const occupato = () =>
  new AppError(503, 'GEOCODIFICA_OCCUPATA', 'Il servizio di ricerca degli indirizzi è momentaneamente occupato: riprova tra qualche secondo, oppure scegli il punto sulla mappa.');

/** Esegue le chiamate una alla volta, distanziate di almeno un secondo. */
function inCoda(fn) {
  const risultato = coda.then(async () => {
    const attesa = ultimaChiamata + INTERVALLO_MS - Date.now();
    if (attesa > 0) await new Promise((r) => setTimeout(r, attesa));
    try {
      return await fn();
    } finally {
      ultimaChiamata = Date.now();
    }
  });
  coda = risultato.catch(() => {});
  return risultato;
}

async function chiama(percorso, parametri) {
  if (!env.GEOCODING_ENABLED) throw nonDisponibile();
  const base = env.GEOCODING_URL.endsWith('/') ? env.GEOCODING_URL : `${env.GEOCODING_URL}/`;
  const url = new URL(percorso, base);
  for (const [k, v] of Object.entries({ format: 'jsonv2', addressdetails: 1, 'accept-language': 'it', ...parametri })) {
    url.searchParams.set(k, String(v));
  }
  if (env.GEOCODING_EMAIL) url.searchParams.set('email', env.GEOCODING_EMAIL);

  const chiave = url.toString();
  const inCache = cache.get(chiave);
  if (inCache && inCache.scadenza > Date.now()) return inCache.valore;

  const richiesta = async () => {
    try {
      return await fetch(url, {
        headers: { 'User-Agent': `LaNostraCitta/1.0 (${env.APP_ORIGIN})`, Referer: env.APP_ORIGIN },
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      logger.warn({ err: err.message }, 'Geocodifica non raggiungibile');
      throw nonDisponibile();
    }
  };

  const valore = await inCoda(async () => {
    let res = await richiesta();
    // 429: il servizio chiede di rallentare (succede con un IP condiviso, es. la rete di una scuola).
    // Si attende e si riprova una sola volta.
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, ATTESA_DOPO_429_MS));
      res = await richiesta();
    }
    if (res.status === 429) {
      logger.warn('Geocodifica: troppe richieste (429)');
      throw occupato();
    }
    if (!res.ok) {
      logger.warn({ status: res.status }, 'Geocodifica: risposta non valida');
      throw nonDisponibile();
    }
    return res.json();
  });

  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(chiave, { valore, scadenza: Date.now() + DURATA_CACHE_MS });
  return valore;
}

const normalizza = (t) =>
  String(t ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();

/** Quartiere della piattaforma che corrisponde ai nomi di zona restituiti da OpenStreetMap. */
export function quartiereCorrispondente(address, quartieri) {
  if (!address) return null;
  const zone = ['quarter', 'neighbourhood', 'suburb', 'city_district'].map((k) => normalizza(address[k])).filter(Boolean);
  for (const zona of zone) {
    const trovato = quartieri.find((q) => normalizza(q.nome) === zona);
    if (trovato) return trovato;
  }
  // "Municipio 9": utile solo se un unico quartiere appartiene a quel municipio.
  const municipio = Number(/^municipio\s+(\d)$/.exec(normalizza(address.suburb))?.[1]);
  if (municipio) {
    const nelMunicipio = quartieri.filter((q) => q.municipio === municipio);
    if (nelMunicipio.length === 1) return nelMunicipio[0];
  }
  return null;
}

function indirizzoBreve(address) {
  if (!address) return null;
  const via = address.road ?? address.pedestrian ?? address.square ?? address.footway ?? null;
  if (!via) return null;
  return address.house_number ? `${via} ${address.house_number}` : via;
}

function presenta(risultato, quartieri) {
  const quartiere = quartiereCorrispondente(risultato.address, quartieri);
  const zona = risultato.address?.quarter ?? risultato.address?.neighbourhood ?? risultato.address?.suburb ?? null;
  const indirizzo = indirizzoBreve(risultato.address);
  return {
    etichetta: [indirizzo ?? risultato.name, zona].filter(Boolean).join(', ') || risultato.display_name,
    descrizione: risultato.display_name,
    indirizzo,
    latitudine: Number(Number(risultato.lat).toFixed(6)),
    longitudine: Number(Number(risultato.lon).toFixed(6)),
    quartiere: quartiere ? { id_quartiere: quartiere.id_quartiere, nome: quartiere.nome } : null,
  };
}

export async function cerca(testo) {
  const [risultati, quartieri] = await Promise.all([
    chiama('search', { q: testo, countrycodes: 'it', viewbox: AREA_MILANO, bounded: 1, limit: 5 }),
    catalogoRepository.listQuartieri(),
  ]);
  return (Array.isArray(risultati) ? risultati : []).map((r) => presenta(r, quartieri));
}

export async function inversa(latitudine, longitudine) {
  const [risultato, quartieri] = await Promise.all([
    // Coordinate arrotondate al metro: clic vicini riusano la cache.
    chiama('reverse', { lat: latitudine.toFixed(5), lon: longitudine.toFixed(5), zoom: 18 }),
    catalogoRepository.listQuartieri(),
  ]);
  if (!risultato || risultato.error) return null;
  return presenta(risultato, quartieri);
}

/** Solo per i test. */
export function svuotaCache() {
  cache.clear();
}
