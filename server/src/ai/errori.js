/**
 * Il job non è fallito ma va eseguito più tardi (limite di richieste del provider raggiunto,
 * tempo dell'invocazione quasi esaurito): torna in coda senza consumare un tentativo.
 */
export class RinvioJob extends Error {
  /** @param {string} motivo @param {number} ritardoMs dopo quanto riprovare */
  constructor(motivo, ritardoMs = 60_000) {
    super(motivo);
    this.name = 'RinvioJob';
    this.ritardoMs = ritardoMs;
  }
}
