/**
 * Análise de uma categoria (em qualquer profundidade da árvore) — parte pura,
 * sem banco, para ser testada isoladamente. Todos os valores em centavos.
 *
 * Convenção de sinal: "realizado" de uma despesa é o gasto (positivo); um
 * estorno (lançamento positivo em categoria de despesa) reduz o realizado.
 * Para receita, realizado é a entrada (positivo).
 */

export type CategoryTypeValue = "RECEITA" | "DESPESA";

export type CategoryRow = { id: string; name: string; parentId: string | null; type: CategoryTypeValue; order: number };

/** Lançamento de consumo já reduzido ao necessário para agregar. */
export type TxRow = { categoryId: string | null; amountCents: number; year: number; month: number };

export const UNCATEGORIZED_ID = "__none__";
export const OWN_ID = "__own__";

export type ChildSummary = {
  /** id da categoria, ou UNCATEGORIZED_ID / OWN_ID para as linhas sintéticas. */
  id: string;
  name: string;
  realizedCents: number;
  plannedCents: number;
  previousCents: number;
  changePct: number | null;
  /** Participação no realizado do nó pai (0–100). */
  sharePct: number;
  hasChildren: boolean;
  /** Linhas sintéticas (lançado direto no grupo) não abrem análise própria. */
  drillable: boolean;
};

export type CategoryAnalysis = {
  type: CategoryTypeValue;
  path: { id: string | null; name: string }[];
  node: {
    id: string | null;
    name: string;
    realizedCents: number;
    plannedCents: number;
    previousCents: number;
    changePct: number | null;
    /** Lançado diretamente neste nó (sem contar os filhos). */
    ownCents: number;
  };
  children: ChildSummary[];
  trend: { year: number; month: number; cents: number }[];
  /** ids de categoria cujos lançamentos pertencem a este nó (ele + descendentes). `null` = sem categoria. */
  categoryIds: (string | null)[];
};

const ROOT_NAME: Record<CategoryTypeValue, string> = { DESPESA: "Despesas", RECEITA: "Receitas" };

function ym(year: number, month: number) {
  return year * 12 + (month - 1);
}

function pct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = ym(year, month) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function buildCategoryAnalysis(input: {
  categories: CategoryRow[];
  /** Planejado do mês selecionado, por categoria (centavos). */
  planned: Map<string, number>;
  tx: TxRow[];
  type: CategoryTypeValue;
  /** null = nível raiz do tipo; UNCATEGORIZED_ID = lançamentos sem categoria. */
  categoryId: string | null;
  year: number;
  month: number;
  monthsBack?: number;
}): CategoryAnalysis | null {
  const { type, year, month } = input;
  const monthsBack = input.monthsBack ?? 6;
  const sign = type === "DESPESA" ? -1 : 1;
  const current = ym(year, month);
  const previous = current - 1;

  const cats = input.categories.filter((c) => c.type === type);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const childrenOf = new Map<string | null, CategoryRow[]>();
  for (const c of cats) {
    const parent = c.parentId && byId.has(c.parentId) ? c.parentId : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(c);
    childrenOf.set(parent, list);
  }
  for (const list of childrenOf.values()) list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  // Soma própria por categoria e por mês (chave ym). Sem categoria: decide o tipo pelo sinal.
  const own = new Map<string, Map<number, number>>();
  const add = (key: string, k: number, cents: number) => {
    const m = own.get(key) ?? new Map<number, number>();
    m.set(k, (m.get(k) ?? 0) + cents);
    own.set(key, m);
  };
  for (const t of input.tx) {
    const k = ym(t.year, t.month);
    if (t.categoryId && byId.has(t.categoryId)) add(t.categoryId, k, sign * t.amountCents);
    else if (!t.categoryId) {
      const txType: CategoryTypeValue = t.amountCents < 0 ? "DESPESA" : "RECEITA";
      if (txType === type) add(UNCATEGORIZED_ID, k, sign * t.amountCents);
    }
  }
  const ownAt = (id: string, k: number) => own.get(id)?.get(k) ?? 0;

  // Totais com descendentes (memoizado por nó e mês).
  const memo = new Map<string, number>();
  const totalAt = (id: string, k: number): number => {
    const key = `${id}:${k}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let sum = ownAt(id, k);
    for (const c of childrenOf.get(id) ?? []) sum += totalAt(c.id, k);
    memo.set(key, sum);
    return sum;
  };
  const plannedTotal = (id: string): number => {
    let sum = input.planned.get(id) ?? 0;
    for (const c of childrenOf.get(id) ?? []) sum += plannedTotal(c.id);
    return sum;
  };
  const descendants = (id: string): string[] => {
    const out = [id];
    for (const c of childrenOf.get(id) ?? []) out.push(...descendants(c.id));
    return out;
  };

  const roots = childrenOf.get(null) ?? [];
  // Um grupo raiz com filhos (ex.: "Despesas Mensais") é só um agrupador: no
  // primeiro nível mostramos direto as grandes categorias dentro dele.
  const isGroupingRoot = (c: CategoryRow) => c.parentId === null && (childrenOf.get(c.id)?.length ?? 0) > 0;

  const trendOf = (totalFn: (k: number) => number) =>
    Array.from({ length: monthsBack }, (_, i) => {
      const k = current - (monthsBack - 1 - i);
      return { year: Math.floor(k / 12), month: (k % 12) + 1, cents: totalFn(k) };
    });

  const childRow = (c: CategoryRow, parentRealized: number): ChildSummary => {
    const realized = totalAt(c.id, current);
    const prev = totalAt(c.id, previous);
    return {
      id: c.id,
      name: c.name,
      realizedCents: realized,
      plannedCents: plannedTotal(c.id),
      previousCents: prev,
      changePct: pct(realized, prev),
      sharePct: parentRealized > 0 ? Math.round((realized / parentRealized) * 1000) / 10 : 0,
      hasChildren: (childrenOf.get(c.id)?.length ?? 0) > 0,
      drillable: true,
    };
  };
  const synthetic = (id: string, name: string, realized: number, prev: number, parentRealized: number, drillable: boolean): ChildSummary => ({
    id,
    name,
    realizedCents: realized,
    plannedCents: 0,
    previousCents: prev,
    changePct: pct(realized, prev),
    sharePct: parentRealized > 0 ? Math.round((realized / parentRealized) * 1000) / 10 : 0,
    hasChildren: false,
    drillable,
  });
  const visible = (r: ChildSummary) => r.realizedCents !== 0 || r.plannedCents !== 0 || r.previousCents !== 0;
  const sortRows = (rows: ChildSummary[]) => rows.sort((a, b) => b.realizedCents - a.realizedCents || b.plannedCents - a.plannedCents || a.name.localeCompare(b.name));

  // ---------- nível raiz do tipo ----------
  if (input.categoryId === null) {
    const totalFn = (k: number) => roots.reduce((acc, r) => acc + totalAt(r.id, k), 0) + ownAt(UNCATEGORIZED_ID, k);
    const realized = totalFn(current);
    const prev = totalFn(previous);

    const top = roots.flatMap((r) => (isGroupingRoot(r) ? childrenOf.get(r.id)! : [r]));
    const rows = top.map((c) => childRow(c, realized));
    // Lançado direto nos agrupadores raiz (sem subcategoria).
    const groupOwnNow = roots.filter(isGroupingRoot).reduce((acc, r) => acc + ownAt(r.id, current), 0);
    const groupOwnPrev = roots.filter(isGroupingRoot).reduce((acc, r) => acc + ownAt(r.id, previous), 0);
    if (groupOwnNow !== 0 || groupOwnPrev !== 0) rows.push(synthetic(OWN_ID, "Direto no grupo (sem subcategoria)", groupOwnNow, groupOwnPrev, realized, false));
    const noneNow = ownAt(UNCATEGORIZED_ID, current);
    const nonePrev = ownAt(UNCATEGORIZED_ID, previous);
    if (noneNow !== 0 || nonePrev !== 0) rows.push(synthetic(UNCATEGORIZED_ID, "Sem categoria", noneNow, nonePrev, realized, true));

    return {
      type,
      path: [{ id: null, name: ROOT_NAME[type] }],
      node: {
        id: null,
        name: ROOT_NAME[type],
        realizedCents: realized,
        plannedCents: roots.reduce((acc, r) => acc + plannedTotal(r.id), 0),
        previousCents: prev,
        changePct: pct(realized, prev),
        ownCents: 0,
      },
      children: sortRows(rows.filter(visible)),
      trend: trendOf(totalFn),
      categoryIds: [...roots.flatMap((r) => descendants(r.id)), null],
    };
  }

  // ---------- lançamentos sem categoria ----------
  if (input.categoryId === UNCATEGORIZED_ID) {
    const totalFn = (k: number) => ownAt(UNCATEGORIZED_ID, k);
    const realized = totalFn(current);
    const prev = totalFn(previous);
    return {
      type,
      path: [{ id: null, name: ROOT_NAME[type] }, { id: UNCATEGORIZED_ID, name: "Sem categoria" }],
      node: { id: UNCATEGORIZED_ID, name: "Sem categoria", realizedCents: realized, plannedCents: 0, previousCents: prev, changePct: pct(realized, prev), ownCents: realized },
      children: [],
      trend: trendOf(totalFn),
      categoryIds: [null],
    };
  }

  // ---------- um nó da árvore ----------
  const node = byId.get(input.categoryId);
  if (!node) return null;

  const realized = totalAt(node.id, current);
  const prev = totalAt(node.id, previous);
  const kids = childrenOf.get(node.id) ?? [];
  const rows = kids.map((c) => childRow(c, realized));
  const ownNow = ownAt(node.id, current);
  const ownPrev = ownAt(node.id, previous);
  if (kids.length > 0 && (ownNow !== 0 || ownPrev !== 0)) rows.push(synthetic(OWN_ID, `Direto em ${node.name}`, ownNow, ownPrev, realized, false));

  const path: { id: string | null; name: string }[] = [];
  let cursor: CategoryRow | undefined = node;
  while (cursor) {
    if (cursor.id === node.id || !isGroupingRoot(cursor)) path.unshift({ id: cursor.id, name: cursor.name });
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  path.unshift({ id: null, name: ROOT_NAME[type] });

  return {
    type,
    path,
    node: {
      id: node.id,
      name: node.name,
      realizedCents: realized,
      plannedCents: plannedTotal(node.id),
      previousCents: prev,
      changePct: pct(realized, prev),
      ownCents: ownNow,
    },
    children: sortRows(rows.filter(visible)),
    trend: trendOf((k) => totalAt(node.id, k)),
    categoryIds: descendants(node.id),
  };
}
