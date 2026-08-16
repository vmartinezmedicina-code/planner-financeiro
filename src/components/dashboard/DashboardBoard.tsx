"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { MonthYearSelector } from "@/components/MonthYearSelector";
import { BalanceCard } from "@/components/BalanceCard";
import { formatCurrency } from "@/lib/format";

type DashboardData = {
  summary: {
    plannedBalance: number;
    realizedBalance: number;
    totalReceitaPlanned: number;
    totalReceitaRealized: number;
    totalDespesaPlanned: number;
    totalDespesaRealized: number;
  };
  comparison: { id: string; name: string; depth: number; planned: number; realized: number }[];
  byBank: { label: string; total: number }[];
  byCard: { label: string; total: number }[];
  evolution: { label: string; receita: number; despesa: number }[];
};

export function DashboardBoard({ initialData, year, month }: { initialData: DashboardData; year: number; month: number }) {
  const router = useRouter();
  const [data, setData] = useState(initialData);

  useEffect(() => setData(initialData), [initialData]);

  const reload = useCallback(async (y: number, m: number) => {
    const res = await fetch(`/api/dashboard?year=${y}&month=${m}`);
    if (res.ok) setData(await res.json());
  }, []);

  function handleMonthChange(y: number, m: number) {
    router.push(`/?year=${y}&month=${m}`);
    reload(y, m);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <MonthYearSelector year={year} month={month} onChange={handleMonthChange} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <BalanceCard label="Saldo do período (realizado)" value={data.summary.realizedBalance} />
        <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Receitas realizadas</span>
          <span className="text-xl font-semibold text-positive">{formatCurrency(data.summary.totalReceitaRealized)}</span>
          <span className="text-xs text-muted">Planejado: {formatCurrency(data.summary.totalReceitaPlanned)}</span>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Despesas realizadas</span>
          <span className="text-xl font-semibold text-negative">{formatCurrency(data.summary.totalDespesaRealized)}</span>
          <span className="text-xs text-muted">Planejado: {formatCurrency(data.summary.totalDespesaPlanned)}</span>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Evolução de receitas e despesas</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.evolution} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted)" }} />
              <YAxis tick={{ fontSize: 12, fill: "var(--muted)" }} width={70} tickFormatter={(v) => formatCurrency(Number(v))} />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value ?? 0))}
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="receita" name="Receitas" stroke="var(--positive)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="despesa" name="Despesas" stroke="var(--negative)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Planejado vs. Realizado</h2>
        <div className="flex flex-col divide-y divide-border">
          {data.comparison.map((row) => {
            const pct = row.planned > 0 ? Math.min(200, (row.realized / row.planned) * 100) : row.realized > 0 ? 100 : 0;
            const over = row.planned > 0 && row.realized > row.planned;
            return (
              <div key={row.id} className="py-2.5 flex flex-col gap-1" style={{ paddingLeft: row.depth * 16 }}>
                <div className="flex items-center justify-between text-sm">
                  <span className={clsx("truncate", row.depth === 0 && "font-medium text-foreground")}>{row.name}</span>
                  <span className="text-xs text-muted whitespace-nowrap">
                    {formatCurrency(row.realized)} / {formatCurrency(row.planned)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
                  <div
                    className={clsx("h-full rounded-full", over ? "bg-negative" : "bg-accent")}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Por instituição financeira</h2>
          <div className="flex flex-col divide-y divide-border">
            {data.byBank.map((b) => (
              <div key={b.label} className="py-2 flex items-center justify-between text-sm">
                <span>{b.label}</span>
                <span className={clsx("font-medium", b.total >= 0 ? "text-positive" : "text-negative")}>
                  {formatCurrency(b.total)}
                </span>
              </div>
            ))}
            {data.byBank.length === 0 && <p className="text-xs text-muted py-2">Sem dados no período.</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Por cartão de crédito</h2>
          <div className="flex flex-col divide-y divide-border">
            {data.byCard.map((c) => (
              <div key={c.label} className="py-2 flex items-center justify-between text-sm">
                <span>{c.label}</span>
                <span className={clsx("font-medium", c.total >= 0 ? "text-positive" : "text-negative")}>
                  {formatCurrency(c.total)}
                </span>
              </div>
            ))}
            {data.byCard.length === 0 && <p className="text-xs text-muted py-2">Sem dados no período.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
