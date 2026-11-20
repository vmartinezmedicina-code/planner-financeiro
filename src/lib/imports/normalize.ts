import { createHash } from "node:crypto";

/**
 * Normalização de descrições importadas (puro, testável). Faturas e extratos
 * trazem a mesma loja de jeitos diferentes ("IFD*IFOOD CLUB", "IFOOD *RESTAURANTE",
 * "PARC 03/10 MAGAZINE LUIZA"); aqui viram uma chave estável para histórico de
 * categoria, deduplicação e hash.
 */

const INSTALLMENT_PATTERNS = [
  /\bparc(?:ela)?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/i,
  /\b(\d{1,2})\s*\/\s*(\d{1,2})\b(?!\s*\/)/,
  /\b(\d{1,2})\s+de\s+(\d{1,2})\b/i,
];

/** Extrai "parcela n de N" do texto, se houver (n ≤ N, N entre 2 e 60). */
export function parseInstallment(text: string): { number: number; total: number } | null {
  for (const re of INSTALLMENT_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    const total = Number(m[2]);
    if (n >= 1 && total >= 2 && total <= 60 && n <= total) return { number: n, total };
  }
  return null;
}

/** "3/10" → {3, 10}; vazio/ inválido → null. */
export function parseInstallmentField(value: string | null | undefined): { number: number; total: number } | null {
  if (!value) return null;
  const m = value.match(/(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/i);
  if (!m) return null;
  const n = Number(m[1]);
  const total = Number(m[2]);
  if (n >= 1 && total >= 2 && total <= 60 && n <= total) return { number: n, total };
  return null;
}

/** Tira a marcação de parcela do nome ("Loja X PARC 03/10" → "Loja X"); o sistema acrescenta "(3/10)". */
export function stripInstallment(text: string): string {
  if (!parseInstallment(text)) return text.trim();
  let s = text;
  for (const re of INSTALLMENT_PATTERNS) {
    if (re.test(s)) {
      s = s.replace(re, " ");
      break;
    }
  }
  const cleaned = s.replace(/\s*[-–|]\s*$/, "").replace(/^\s*[-–|]\s*/, "").replace(/\s{2,}/g, " ").trim();
  return cleaned || text.trim();
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Prefixos de adquirentes/intermediários que não identificam a loja.
const NOISE_PREFIX = /^(?:(?:ifd|pg|pag|mp|ec|ppro|pagseguro|mercadopago|sumup|stone|cielo|rede|getnet|dl|pp|ebn|htm|sq)\s*\*\s*)+/;

const STOPWORDS = new Set([
  "compra", "cartao", "credito", "debito", "pix", "enviado", "recebido", "transferencia", "pagamento",
  "parc", "parcela", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "ltda", "me", "sa", "eireli", "br", "bra",
  "com", "www", "loja", "online", "int", "nacional",
]);

/** Texto comparável: minúsculas, sem acento, sem parcela, sem pontuação e sem números soltos. */
export function normalizeDescription(text: string): string {
  let s = stripAccents(text).toLowerCase();
  for (const re of INSTALLMENT_PATTERNS) s = s.replace(re, " ");
  s = s.replace(NOISE_PREFIX, "");
  s = s.replace(/[*_.\-/\\|#:,;()[\]"']/g, " ");
  s = s
    .split(/\s+/)
    .filter((t) => t && !/^\d+$/.test(t))
    .join(" ");
  return s.trim();
}

/** Chave da loja: até 2 palavras significativas (para histórico de categoria). */
export function merchantKey(text: string): string {
  const tokens = normalizeDescription(text)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return tokens.slice(0, 2).join(" ");
}

/** Semelhança entre duas descrições (Jaccard das palavras significativas), 0..1. */
export function descriptionSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeDescription(a).split(" ").filter((t) => t.length >= 2 && !STOPWORDS.has(t)));
  const tb = new Set(normalizeDescription(b).split(" ").filter((t) => t.length >= 2 && !STOPWORDS.has(t)));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  // Prefixo comum também conta ("ifood" × "ifoodclub").
  if (inter === 0) {
    for (const x of ta) for (const y of tb) if (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))) inter = 0.5;
  }
  return inter / (ta.size + tb.size - inter);
}

/**
 * Impressão digital de uma linha importada: conta/cartão + data + valor +
 * descrição normalizada + parcela. Duas importações do mesmo documento geram
 * o mesmo hash; as parcelas futuras geradas também (mesma data original).
 */
export function sourceHash(parts: {
  accountId: string;
  date: Date;
  amountCents: number;
  description: string;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
}): string {
  const key = [
    parts.accountId,
    parts.date.toISOString().slice(0, 10),
    parts.amountCents,
    normalizeDescription(parts.description),
    parts.installmentNumber && parts.installmentTotal ? `${parts.installmentNumber}/${parts.installmentTotal}` : "",
  ].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

/** Soma meses a uma data UTC mantendo o dia (com clamp no fim do mês). */
export function addMonthsUtc(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last)));
}

/** "2026-11-05" → Date UTC; aceita também "05/11/2026" e "05/11/26". */
export function parseDateLoose(value: string): Date | null {
  const v = value.trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validDate(year, Number(m[2]), Number(m[1]));
  }
  return null;
}

function validDate(y: number, mo: number, d: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 ? date : null;
}
