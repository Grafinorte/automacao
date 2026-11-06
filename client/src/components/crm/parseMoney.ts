/**
 * Lê o valor como o vendedor escreve: "1500", "1.500", "1,500", "1.500,50", "R$ 2000".
 * Vazio vale zero; texto que não é valor volta NaN.
 */
export function parseMoney(text: string): number {
  const t = text.replace(/r\$/i, "").replace(/\s/g, "");
  if (!t) return 0;
  if (!/^\d[\d.,]*$/.test(t)) return NaN;
  // Grupos de três dígitos são milhar, mesmo sem os centavos
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) return Number(t.replace(/[.,]/g, ""));
  if (t.includes(",")) {
    const last = t.lastIndexOf(",");
    return Number(`${t.slice(0, last).replace(/[.,]/g, "")}.${t.slice(last + 1)}`);
  }
  return Number(t);
}
