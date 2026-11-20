import { addMonthsUtc, descriptionSimilarity, merchantKey } from "./normalize";

/**
 * Deduplicação em três níveis (puro):
 * - LIKELY: mesmo hash, ou mesmo valor + mesma data (±1 dia) + descrição parecida,
 *   ou mesma parcela (n/N) do mesmo valor. Entra desmarcado.
 * - POSSIBLE: mesmo valor em até 3 dias com descrição diferente. Entra marcado, com aviso.
 * - NEW: nada parecido.
 * REPEATED (itens repetidos entre arquivos da mesma importação, ex.: prints que se
 * sobrepõem) é tratado por `findRepeatedInSession`.
 */

export type DuplicateLevel = "NEW" | "POSSIBLE" | "LIKELY";

export type DedupeItem = {
  date: Date;
  amountCents: number;
  description: string;
  sourceHash: string;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
};

export type DedupeCandidate = {
  id: string;
  eventDate: Date;
  amountCents: number;
  description: string;
  sourceHash: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
};

const DAY = 86400000;

function daysApart(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / DAY;
}

export function classifyDuplicate(item: DedupeItem, candidates: DedupeCandidate[]): { level: DuplicateLevel; matchId: string | null } {
  let possible: string | null = null;
  // Datas em que a parcela n pode estar lançada: a data impressa (às vezes já é a da parcela)
  // ou a data original + (n−1) meses (como o sistema grava parcelas).
  const dates = [item.date];
  if (item.installmentNumber && item.installmentNumber > 1) dates.push(addMonthsUtc(item.date, item.installmentNumber - 1));

  for (const c of candidates) {
    if (c.sourceHash && c.sourceHash === item.sourceHash) return { level: "LIKELY", matchId: c.id };
    if (c.amountCents !== item.amountCents) continue;
    const nearest = Math.min(...dates.map((d) => daysApart(d, c.eventDate)));

    if (item.installmentNumber && item.installmentTotal) {
      if (c.installmentNumber === item.installmentNumber && (c.installmentTotal === null || c.installmentTotal === item.installmentTotal) && nearest <= 45) {
        return { level: "LIKELY", matchId: c.id };
      }
    }
    if (nearest <= 1 && descriptionSimilarity(item.description, c.description) >= 0.34) return { level: "LIKELY", matchId: c.id };
    if (nearest <= 3 && !possible) possible = c.id;
  }
  return possible ? { level: "POSSIBLE", matchId: possible } : { level: "NEW", matchId: null };
}

export type SessionItem = {
  id: string;
  fileName: string | null;
  position: number;
  date: Date;
  amountCents: number;
  description: string;
  installmentNumber: number | null;
  installmentTotal: number | null;
};

/**
 * Itens iguais (mesma data, valor, loja e parcela) vindos de ARQUIVOS diferentes
 * da mesma importação: o primeiro fica, os outros são marcados como repetidos.
 * Repetições dentro do mesmo arquivo são mantidas (duas compras iguais no dia).
 */
export function findRepeatedInSession(items: SessionItem[]): Map<string, string> {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const firstByKey = new Map<string, SessionItem>();
  const repeated = new Map<string, string>();
  for (const it of sorted) {
    const key = [
      it.date.toISOString().slice(0, 10),
      it.amountCents,
      merchantKey(it.description),
      it.installmentNumber ?? "",
      it.installmentTotal ?? "",
    ].join("|");
    const first = firstByKey.get(key);
    if (!first) {
      firstByKey.set(key, it);
      continue;
    }
    if (first.fileName !== it.fileName) repeated.set(it.id, first.id);
  }
  return repeated;
}
