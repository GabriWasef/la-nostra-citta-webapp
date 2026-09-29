// Ciclo di vita della segnalazione (RF10): transizioni ammesse tra stati.
// È l'unico punto in cui sono definite; l'interfaccia le riceve da GET /api/v1/stati.
export const TRANSIZIONI = Object.freeze({
  INSERITA: ['IN_VERIFICA', 'APPROVATA', 'RIFIUTATA'],
  IN_VERIFICA: ['APPROVATA', 'RIFIUTATA'],
  APPROVATA: ['PRESA_IN_CARICO', 'IN_VALUTAZIONE', 'CHIUSA'],
  RIFIUTATA: ['IN_VERIFICA'],
  PRESA_IN_CARICO: ['IN_VALUTAZIONE', 'CHIUSA'],
  IN_VALUTAZIONE: ['DOCUMENTO_PROGRAMMATICO', 'CHIUSA'],
  DOCUMENTO_PROGRAMMATICO: ['INVIATA_CANDIDATI', 'CHIUSA'],
  INVIATA_CANDIDATI: ['CHIUSA'],
  CHIUSA: [],
});

export const STATO_INIZIALE = 'INSERITA';

export function transizioneAmmessa(da, a) {
  return (TRANSIZIONI[da] ?? []).includes(a);
}
