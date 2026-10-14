// Immagine da inviare a un modello: lato lungo al massimo 1024 px, JPEG, senza metadati.
import sharp from 'sharp';

export const LATO_MASSIMO_LLM = 1024;

/** @param {Buffer} immagine @returns {Promise<string>} data URI base64 */
export async function dataUriPerModello(immagine) {
  const jpeg = await sharp(immagine)
    .rotate()
    .resize({ width: LATO_MASSIMO_LLM, height: LATO_MASSIMO_LLM, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 80 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}
