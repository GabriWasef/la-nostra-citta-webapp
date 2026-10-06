// Punto d'ingresso della funzione Vercel: tutte le richieste a /api/* arrivano qui
// (vedi "rewrites" in vercel.json). Le pagine del sito sono file statici serviti dalla CDN.
import { createApp } from '../server/src/app.js';

export default createApp();
