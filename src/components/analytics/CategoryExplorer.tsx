"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { MONTH_NAMES } from "@/lib/format";
import { formatCents } from "@/lib/money";
import type { CategoryAnalysisResponse } from "@/lib/analytics/categoryAnalytics";
import { TrendChart } from "./TrendChart";
import { TransactionDrilldown } from "./TransactionDrilldown";

type CategoryType = "RECEITA" | "DESPESA";

function requestKey(type: CategoryType, categoryId: string | null, year: number, month: number) {
  return `${type}|${categoryId ?? ""}|${year}-${month}`;
}

/** Variação contra o mês anterior. Para despesa, subir é ruim; para receita, é bom. */
function Change({ pct, type }: { pct: number | null; type: CategoryType }) {
  if (pct === null) return null;
  const up = pct > 0;
  const good = type === "DESPESA" ? !up : up;
  return (
    <span className={clsx("inline-flex items-center gap-0.5 font-medium", pct === 0 ? "text-muted" : good ? "text-positive" : "text-negative")}>
      {pct !== 0 && (up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />)}
      {up ? "+" : ""}
      {pct.toLocaleString("pt-BR")}%
    </span>
  );
}

/**
 * Explorador de categorias: começa nas grandes categorias e desce quantos
 * níveis a árvore tiver. Em cada nível mostra total, planejado, mês anterior,
 * tendência de 6 meses, as subcategorias e os lançamentos.
 */
export function CategoryExplorer({
  type,
  year,
  month,
  onMonthChange,
}: {
  type: CategoryType;
  year: number;
  month: number;
  onMonthChange?: (year: number, month: number) => void;
}) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [result, setResult] = useState<{ key: string; data: CategoryAnalysisResponse | null; error: string | null } | null>(null);

  const key = requestKey(type, categoryId, year, month);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ type, year: String(year), month: String(month) });
    if (categoryId) params.set("categoryId", categoryId);
    fetch(`/api/analytics/category?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok) setResult({ key, data: json, error: null });
        else setResult({ key, data: null, error: json?.error ?? "Não foi possível carregar." });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, data: null, error: "Sem conexão com o servidor." });
      });
    return () => {
      cancelled = true;
    };
  }, [key, type, categoryId, year, month]);

  const loading = !result || result.key !== key;
  const data = result?.data ?? null;

  if (!data) {
    if (!loading && result?.error) {
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-negative">{result.error}</p>
          {categoryId && (
            <button type="button" onClick={() => setCategoryId(null)} className="text-xs font-medium text-accent text-left">
              Voltar ao início
            </button>
          )}
        </div>
      );
    }
    return <p className="text-sm text-muted">Carregando…</p>;
  }

  const { node, path, children } = data;
  const parent = path.length > 1 ? path[path.length - 2] : null;
  const over = node.plannedCents > 0 && node.realizedCents > node.plannedCents;
  const usedPct = node.plannedCents > 0 ? Math.min(100, (node.realizedCents / node.plannedCents) * 100) : 0;
  const prevMonthName = MONTH_NAMES[(month + 10) % 12].toLowerCase();

  return (
    <div className={clsx("flex flex-col gap-5 transition-opacity", loading && "opacity-50")} aria-busy={loading}>
      {/* Caminho */}
      <nav className="flex items-center gap-1 flex-wrap text-xs" aria-label="Caminho da categoria">
        {parent && (
          <button
            type="button"
            onClick={() => setCategoryId(parent.id)}
            className="h-7 w-7 -ml-1.5 flex items-center justify-center rounded-full hover:bg-surface-muted"
            aria-label={`Voltar para ${parent.name}`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {path.map((p, i) => {
          const last = i === path.length - 1;
          return (
            <span key={p.id ?? "root"} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 text-muted" />}
              {last ? (
                <span className="font-medium text-foreground">{p.name}</span>
              ) : (
                <button type="button" onClick={() => setCategoryId(p.id)} className="text-muted hover:text-foreground underline-offset-2 hover:underline">
                  {p.name}
                </button>
              )}
            </span>
          );
        })}
      </nav>

      {/* Resumo do nó */}
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-2xl font-semibold text-foreground tabular-nums">{formatCents(node.realizedCents)}</p>
          <p className="text-xs text-muted">
            {MONTH_NAMES[month - 1]} de {year}
          </p>
        </div>
        {node.plannedCents > 0 && (
          <div className="flex flex-col gap-1">
            <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
              <div className={clsx("h-full rounded-full", over ? "bg-negative" : "bg-accent")} style={{ width: `${usedPct}%` }} />
            </div>
            <p className={clsx("text-xs", over ? "text-negative" : "text-muted")}>
              {over
                ? `${formatCents(node.realizedCents - node.plannedCents)} acima do planejado (${formatCents(node.plannedCents)})`
                : `${Math.round(usedPct)}% do planejado (${formatCents(node.plannedCents)})`}
            </p>
          </div>
        )}
        <p className="text-xs text-muted flex items-center gap-1.5 flex-wrap">
          Em {prevMonthName}: {formatCents(node.previousCents)}
          <Change pct={node.changePct} type={type} />
        </p>
      </div>

      {/* Tendência */}
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Últimos 6 meses</h3>
        <TrendChart points={data.trend} onSelect={onMonthChange} />
      </div>

      {/* Subcategorias */}
      {children.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">{node.id === null ? "Categorias" : "Subcategorias"}</h3>
          <div className="flex flex-col divide-y divide-border">
            {children.map((c) => {
              const childOver = c.plannedCents > 0 && c.realizedCents > c.plannedCents;
              const content = (
                <>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{c.name}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      <span className="text-sm font-medium tabular-nums">{formatCents(c.realizedCents)}</span>
                      {c.drillable && <ChevronRight className="h-4 w-4 text-muted" />}
                    </span>
                  </span>
                  <span className="h-1 rounded-full bg-surface-muted overflow-hidden">
                    <span className={clsx("block h-full rounded-full", childOver ? "bg-negative" : "bg-accent")} style={{ width: `${Math.min(100, Math.max(0, c.sharePct))}%` }} />
                  </span>
                  <span className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted">
                    <span>{c.sharePct.toLocaleString("pt-BR")}%</span>
                    {c.plannedCents > 0 && (
                      <span className={clsx(childOver && "text-negative")}>· planejado {formatCents(c.plannedCents)}</span>
                    )}
                    {c.changePct !== null && (
                      <span className="flex items-center gap-1">
                        · <Change pct={c.changePct} type={type} /> vs. {prevMonthName}
                      </span>
                    )}
                    {c.changePct === null && c.previousCents === 0 && c.realizedCents !== 0 && <span>· sem gasto em {prevMonthName}</span>}
                  </span>
                </>
              );
              return c.drillable ? (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className="py-2.5 flex flex-col gap-1.5 text-left hover:bg-surface-muted/60 -mx-2 px-2 rounded-lg"
                >
                  {content}
                </button>
              ) : (
                <div key={c.id} className="py-2.5 flex flex-col gap-1.5">
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lançamentos (a chave reinicia o estado aberto/fechado a cada nó) */}
      <TransactionDrilldown
        key={`${node.id ?? "root"}-${year}-${month}`}
        transactions={data.transactions}
        total={data.transactionCount}
        startOpen={children.length === 0}
        nodeName={node.name}
      />
    </div>
  );
}
