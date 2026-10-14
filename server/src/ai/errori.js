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

/**
 * Il provider non ha dato una risposta utilizzabile (errore HTTP, timeout, JSON non valido).
 * Il messaggio non contiene mai la chiave API.
 */
export class ErroreProvider extends Error {
  /**
   * @param {string} messaggio
   * @param {{modello?: string, stato?: number, limite?: boolean, ritardoMs?: number}} dettagli
   *   limite: limite di richieste raggiunto (429), ritardoMs: dopo quanto riprovare
   */
  constructor(messaggio, { modello, stato, limite = false, ritardoMs } = {}) {
    super(messaggio);
    this.name = 'ErroreProvider';
    this.modello = modello;
    this.stato = stato;
    this.limite = limite;
    this.ritardoMs = ritardoMs;
  }
}
