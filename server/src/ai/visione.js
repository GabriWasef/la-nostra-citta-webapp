// Analisi tecnica delle immagini (RF13), eseguita in modo asincrono dal worker.
// Non è visione artificiale: controlla risoluzione e luminosità per
// segnalare foto inutilizzabili. Un modello di computer vision (pertinenza
// immagine/testo, contenuti inaccettabili) potrà implementare la stessa interfaccia.
import sharp from 'sharp';

export const visioneTecnica = {
  modello: 'controllo-tecnico-immagine@1',

  /** @param {Buffer|string} immagine */
  async analizza(immagine) {
    const img = sharp(immagine);
    const { width, height, format } = await img.metadata();
    const stats = await img.stats();
    const canali = stats.channels.slice(0, 3);
    const luminosita = canali.reduce((s, c) => s + c.mean, 0) / canali.length / 255;

    const problemi = [];
    if (Math.min(width, height) < 320) problemi.push('RISOLUZIONE_BASSA');
    if (luminosita < 0.08) problemi.push('IMMAGINE_TROPPO_SCURA');
    if (luminosita > 0.97) problemi.push('IMMAGINE_SOVRAESPOSTA');

    return {
      esito: problemi.length ? 'DA_REVISIONARE' : 'OK',
      punteggio: problemi.length ? 0.5 : 0,
      risultato: {
        larghezza: width,
        altezza: height,
        formato: format,
        luminosita_media: Number(luminosita.toFixed(3)),
        problemi,
        nota: 'Controllo tecnico; la verifica di pertinenza richiede un modello di visione.',
      },
    };
  },
};
