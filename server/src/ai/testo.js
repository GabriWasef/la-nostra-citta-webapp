/** Minuscole e senza accenti, per confronti su parole chiave. */
export function normalizza(testo) {
  return testo
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function parole(testo) {
  return normalizza(testo).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}
