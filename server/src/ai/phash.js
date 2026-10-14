// Hash percettivo (pHash) a 64 bit: due foto uguali restano vicine anche dopo
// ridimensionamento, ricompressione o piccoli ritocchi (hash_sha256 trova solo le copie identiche).
// Metodo classico: scala di grigi 32x32, DCT bidimensionale, 8x8 frequenze più basse,
// un bit per coefficiente (1 se sopra la mediana).
import sharp from 'sharp';

const N = 32;
const K = 8;
// Distanza di Hamming massima perché due immagini siano considerate la stessa foto.
export const DISTANZA_MASSIMA = 5;

const COSENI = Array.from({ length: K }, (_, u) => Float64Array.from({ length: N }, (_, x) => Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N))));

// Sotto questa deviazione standard dei grigi (0-255) l'immagine è quasi uniforme (cielo, muro,
// foto nera): il suo hash sarebbe rumore e coinciderebbe per caso con quello di altre immagini.
const CONTRASTO_MINIMO = 4;

/** @param {Buffer} immagine @returns {Promise<string|null>} 16 cifre esadecimali minuscole, null se l'immagine è uniforme */
export async function hashPercettivo(immagine) {
  const pixel = await sharp(immagine)
    .rotate()
    .flatten({ background: '#ffffff' })
    .grayscale()
    .resize(N, N, { fit: 'fill' })
    .raw()
    .toBuffer();
  const media = pixel.reduce((s, p) => s + p, 0) / pixel.length;
  const varianza = pixel.reduce((s, p) => s + (p - media) ** 2, 0) / pixel.length;
  if (Math.sqrt(varianza) < CONTRASTO_MINIMO) return null;

  // DCT separabile: prima sulle righe (solo le prime K frequenze), poi sulle colonne.
  const righe = Array.from({ length: K }, (_, u) => {
    const r = new Float64Array(N);
    for (let y = 0; y < N; y++) {
      let s = 0;
      for (let x = 0; x < N; x++) s += COSENI[u][x] * pixel[y * N + x];
      r[y] = s;
    }
    return r;
  });
  const coefficienti = [];
  for (let v = 0; v < K; v++) {
    for (let u = 0; u < K; u++) {
      let s = 0;
      for (let y = 0; y < N; y++) s += COSENI[v][y] * righe[u][y];
      coefficienti.push(s);
    }
  }

  const ordinati = [...coefficienti].sort((a, b) => a - b);
  const mediana = (ordinati[K * K / 2 - 1] + ordinati[K * K / 2]) / 2;
  let bit = 0n;
  for (const c of coefficienti) bit = (bit << 1n) | (c > mediana ? 1n : 0n);
  return bit.toString(16).padStart(16, '0');
}

/** Numero di bit diversi tra due hash. */
export function distanzaHamming(a, b) {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  for (; x; x &= x - 1n) n++;
  return n;
}

