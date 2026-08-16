"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Plus } from "lucide-react";
import { MonthYearSelector } from "@/components/MonthYearSelector";
import { BalanceCard } from "@/components/BalanceCard";
import { CategoryRow } from "@/components/planning/CategoryRow";
import type { CategoryNode } from "@/lib/planning";
import { CategoryType } from "@prisma/client";

type PlanningData = {
  receitaRoots: CategoryNode[];
  despesaRoots: CategoryNode[];
  summary: {
    plannedBalance: number;
    realizedBalance: number;
    totalReceitaPlanned: number;
    totalReceitaRealized: number;
    totalDespesaPlanned: number;
    totalDespesaRealized: number;
  };
};

export function PlanningBoard({
  initialData,
  year,
  month,
}: {
  initialData: PlanningData;
  year: number;
  month: number;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [activeTab, setActiveTab] = useState<"planejado" | "realizado">("planejado");
  const [addingRoot, setAddingRoot] = useState<CategoryType | null>(null);
  const [rootName, setRootName] = useState("");
  const [, startTransition] = useTransition();

  useEffect(() => setData(initialData), [initialData]);

  const reload = useCallback(async (y: number, m: number) => {
    const res = await fetch(`/api/planning?year=${y}&month=${m}`);
    if (res.ok) setData(await res.json());
  }, []);

  function handleMonthChange(y: number, m: number) {
    startTransition(() => {
      router.push(`/planejamento?year=${y}&month=${m}`);
    });
    reload(y, m);
  }

  async function handleEditAmount(categoryId: string, amount: number) {
    await fetch("/api/planned-values", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, year, month, amount }),
    });
    reload(year, month);
  }

  async function handleAddChild(parentId: string, type: CategoryType, name: string) {
    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type, parentId }),
    });
    reload(year, month);
  }

  async function handleAddRoot(e: React.FormEvent, type: CategoryType) {
    e.preventDefault();
    if (!rootName.trim()) return;
    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: rootName.trim(), type, parentId: null }),
    });
    setRootName("");
    setAddingRoot(null);
    reload(year, month);
  }

  async function handleRename(id: string, name: string) {
    await fetch(`/api/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    reload(year, month);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/categories/${id}`, { method: "DELETE" });
    reload(year, month);
  }

  function findSiblings(nodes: CategoryNode[], id: string): CategoryNode[] | null {
    for (const n of nodes) {
      if (n.children.some((c) => c.id === id)) return n.children;
      const found = findSiblings(n.children, id);
      if (found) return found;
    }
    return null;
  }

  async function handleMove(id: string, direction: -1 | 1) {
    const allRoots = [...data.receitaRoots, ...data.despesaRoots];
    let siblings = allRoots.some((r) => r.id === id) ? allRoots : findSiblings(allRoots, id);
    if (!siblings) return;
    const filteredByType = siblings.filter((s) => s.type === siblings!.find((x) => x.id === id)!.type);
    const idx = filteredByType.findIndex((s) => s.id === id);
    const swapWith = filteredByType[idx + direction];
    if (!swapWith) return;

    await fetch("/api/categories/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: [
          { id: filteredByType[idx].id, order: swapWith.order },
          { id: swapWith.id, order: filteredByType[idx].order },
        ],
      }),
    });
    reload(year, month);
  }

  const balance = activeTab === "planejado" ? data.summary.plannedBalance : data.summary.realizedBalance;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Planejamento e Controle</h1>
        <MonthYearSelector year={year} month={month} onChange={handleMonthChange} />
      </div>

      <BalanceCard label={`Saldo mensal (${activeTab})`} value={balance} />

      <div className="flex gap-1 border-b border-border">
        {(["planejado", "realizado"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={clsx(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition capitalize",
              activeTab === tab ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <section className="bg-surface border border-border rounded-2xl p-2 sm:p-3">
        <div className="flex items-center justify-between px-2 py-1">
          <h2 className="text-sm font-semibold text-positive">Receitas</h2>
          {addingRoot !== CategoryType.RECEITA ? (
            <button
              type="button"
              onClick={() => setAddingRoot(CategoryType.RECEITA)}
              className="flex items-center gap-1 text-xs text-accent font-medium"
            >
              <Plus className="h-3.5 w-3.5" /> Nova categoria
            </button>
          ) : null}
        </div>
        {addingRoot === CategoryType.RECEITA && (
          <form onSubmit={(e) => handleAddRoot(e, CategoryType.RECEITA)} className="flex items-center gap-2 px-2 pb-2">
            <input
              autoFocus
              value={rootName}
              onChange={(e) => setRootName(e.target.value)}
              placeholder="Nome da categoria"
              className="flex-1 max-w-xs rounded-md border border-accent bg-surface px-2 py-1 text-sm outline-none"
            />
            <button type="submit" className="text-xs font-medium text-accent">
              Adicionar
            </button>
            <button type="button" onClick={() => setAddingRoot(null)} className="text-xs text-muted">
              Cancelar
            </button>
          </form>
        )}
        {data.receitaRoots.map((node, i) => (
          <CategoryRow
            key={node.id}
            node={node}
            depth={0}
            activeTab={activeTab}
            isFirst={i === 0}
            isLast={i === data.receitaRoots.length - 1}
            onEditAmount={handleEditAmount}
            onAddChild={handleAddChild}
            onRename={handleRename}
            onDelete={handleDelete}
            onMove={handleMove}
          />
        ))}
        {data.receitaRoots.length === 0 && (
          <p className="text-xs text-muted px-2 py-3">Nenhuma categoria de receita ainda.</p>
        )}
      </section>

      <section className="bg-surface border border-border rounded-2xl p-2 sm:p-3">
        <div className="flex items-center justify-between px-2 py-1">
          <h2 className="text-sm font-semibold text-negative">Despesas</h2>
          {addingRoot !== CategoryType.DESPESA ? (
            <button
              type="button"
              onClick={() => setAddingRoot(CategoryType.DESPESA)}
              className="flex items-center gap-1 text-xs text-accent font-medium"
            >
              <Plus className="h-3.5 w-3.5" /> Nova categoria
            </button>
          ) : null}
        </div>
        {addingRoot === CategoryType.DESPESA && (
          <form onSubmit={(e) => handleAddRoot(e, CategoryType.DESPESA)} className="flex items-center gap-2 px-2 pb-2">
            <input
              autoFocus
              value={rootName}
              onChange={(e) => setRootName(e.target.value)}
              placeholder="Nome da categoria"
              className="flex-1 max-w-xs rounded-md border border-accent bg-surface px-2 py-1 text-sm outline-none"
            />
            <button type="submit" className="text-xs font-medium text-accent">
              Adicionar
            </button>
            <button type="button" onClick={() => setAddingRoot(null)} className="text-xs text-muted">
              Cancelar
            </button>
          </form>
        )}
        {data.despesaRoots.map((node, i) => (
          <CategoryRow
            key={node.id}
            node={node}
            depth={0}
            activeTab={activeTab}
            isFirst={i === 0}
            isLast={i === data.despesaRoots.length - 1}
            onEditAmount={handleEditAmount}
            onAddChild={handleAddChild}
            onRename={handleRename}
            onDelete={handleDelete}
            onMove={handleMove}
          />
        ))}
        {data.despesaRoots.length === 0 && (
          <p className="text-xs text-muted px-2 py-3">Nenhuma categoria de despesa ainda.</p>
        )}
      </section>
    </div>
  );
}
