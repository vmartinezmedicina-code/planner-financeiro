/**
 * Operações monetárias centralizadas. Internamente o sistema trabalha com
 * centavos inteiros (R$ 1.234,56 → 123456), o que elimina erro de ponto
 * flutuante em somas e comparações. `Float` antigos só são convertidos nas
 * bordas (entrada do usuário, leitura de colunas legadas, exibição).
 */

/** Reais (número ou string "1.234,56" / "1234.56") → centavos inteiros. */
export function toCents(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "string") {
    const normalized = parseBrazilianNumber(value);
    if (Number.isNaN(normalized)) return 0;
    return roundHalfAwayFromZero(normalized * 100);
  }
  if (!Number.isFinite(value)) return 0;
  return roundHalfAwayFromZero(value * 100);
}

/** Centavos inteiros → reais (número com até 2 casas), para campos legados e gráficos. */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** Soma segura de centavos (ignora valores não finitos). */
export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) if (Number.isFinite(v)) total += Math.round(v);
  return total;
}

/**
 * Divide um total em N parcelas inteiras. A diferença de arredondamento
 * (no máximo N-1 centavos) é distribuída um centavo por parcela a partir
 * da última, para que a soma bata exatamente com o total.
 */
export function splitCents(totalCents: number, parts: number): number[] {
  if (!Number.isInteger(parts) || parts < 1) throw new Error("parts deve ser inteiro >= 1");
  const total = Math.round(totalCents);
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const base = Math.floor(abs / parts);
  let remainder = abs - base * parts;
  const result: number[] = new Array(parts).fill(base);
  for (let i = parts - 1; i >= 0 && remainder > 0; i--, remainder--) result[i] += 1;
  return result.map((v) => v * sign);
}

/** Formata centavos como moeda brasileira: 123456 → "R$ 1.234,56". */
export function formatCents(cents: number): string {
  return fromCents(cents).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Percentual (0–100) de `part` sobre `total`, com 1 casa; 0 quando total é zero. */
export function percentOf(partCents: number, totalCents: number): number {
  if (totalCents === 0) return 0;
  return Math.round((partCents / totalCents) * 1000) / 10;
}

/** Variação percentual entre dois valores; `null` quando a base é zero. */
export function percentChange(currentCents: number, previousCents: number): number | null {
  if (previousCents === 0) return null;
  return Math.round(((currentCents - previousCents) / Math.abs(previousCents)) * 1000) / 10;
}

/** Arredonda "meio para longe do zero" (R$ 0,005 → 1 centavo; −0,005 → −1). */
export function roundHalfAwayFromZero(value: number): number {
  const sign = value < 0 ? -1 : 1;
  // Pequena tolerância evita 1.005*100 = 100.49999 virar 100 em vez de 101.
  return sign * Math.round(Math.abs(value) + 1e-9);
}

/** Interpreta "1.234,56", "1234,56", "1234.56", "R$ 1.234,56", "-12,5". */
export function parseBrazilianNumber(input: string): number {
  const s = input.replace(/[^\d,.\-]/g, "").trim();
  if (!s) return NaN;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  let normalized = s;
  if (hasComma && hasDot) {
    // Último separador é o decimal.
    normalized = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (hasComma) {
    normalized = s.replace(",", ".");
  } else if (hasDot) {
    // "1.234" (milhar) vs "12.34" (decimal): 3 dígitos após o ponto único = milhar.
    const parts = s.split(".");
    if (parts.length === 2 && parts[1].length === 3) normalized = parts.join("");
    else if (parts.length > 2) normalized = parts.join("");
  }
  return Number(normalized);
}

/** Valor absoluto em centavos. */
export function absCents(cents: number): number {
  return Math.abs(Math.round(cents));
}
