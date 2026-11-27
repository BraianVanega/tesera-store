/** "$ 54.900" — pesos enteros con punto de miles, igual que el diseño. Sin Intl: mismo resultado en server y browser. */
export function formatMoney(pesos: number): string {
  const sign = pesos < 0 ? "− " : "";
  const digits = String(Math.abs(Math.trunc(pesos))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}$\u00a0${digits}`; // espacio irrompible: "$" y el número no se separan
}

export function pluralize(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
