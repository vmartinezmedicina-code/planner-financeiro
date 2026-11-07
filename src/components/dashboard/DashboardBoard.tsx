"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Landmark, CreditCard, Layers } from "lucide-react";
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
  totalBankBalance: number;
  bankBalances: { label: string; total: number }[];
  totalOpenInvoices: number;
  dueAlerts: { card: string; open: number; daysLeft: number }[];
  upcomingInstallments: { label: string; total: number }[];
  topCategories: { name: string; value: number }[];
  despesaDeltaPct: number | null;
};

const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };

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

      {data.dueAlerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {data.dueAlerts.map((a) => (
            <div
              key={a.card}
              className="flex items-center gap-2 rounded-xl bg-warning-bg text-warning-fg px-4 py-3 text-sm"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Fatura <strong>{a.card}</strong> ({formatCurrency(a.open)} em aberto) vence{" "}
                {a.daysLeft === 0 ? "hoje" : a.daysLeft === 1 ? "amanhã" : `em ${a.daysLeft} dias`}.
              </span>
            </div>
          ))}
        </div>
      )}

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
          <span className="text-xs text-muted flex items-center gap-1">
            Planejado: {formatCurrency(data.summary.totalDespesaPlanned)}
            {data.despesaDeltaPct !== null && (
              <span
                className={clsx(
                  "ml-1 inline-flex items-center gap-0.5 font-medium",
                  data.despesaDeltaPct > 0 ? "text-negative" : "text-positive"
                )}
              >
                {data.despesaDeltaPct > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(data.despesaDeltaPct).toFixed(0)}% vs. mês anterior
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted flex items-center gap-1.5">
            <Landmark className="h-3.5 w-3.5" /> Saldo total em contas
          </span>
          <span className={clsx("text-xl font-semibold", data.totalBankBalance >= 0 ? "text-foreground" : "text-negative")}>
            {formatCurrency(data.totalBankBalance)}
          </span>
          <span className="text-xs text-muted">{data.bankBalances.length} conta(s) cadastrada(s)</span>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5" /> Faturas em aberto
          </span>
          <span className="text-xl font-semibold text-foreground">{formatCurrency(data.totalOpenInvoices)}</span>
          <span className="text-xs text-muted">lançamentos de cartão ainda pendentes</span>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" /> Parcelas nos próximos 6 meses
          </span>
          <span className="text-xl font-semibold text-foreground">
            {formatCurrency(data.upcomingInstallments.reduce((acc, p) => acc + p.total, 0))}
          </span>
          <span className="text-xs text-muted">compras parceladas já lançadas</span>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Maiores categorias de gasto no mês</h2>
          {data.topCategories.length === 0 ? (
            <p className="text-xs text-muted py-6 text-center">Sem despesas no período.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topCategories} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted)" }} tickFormatter={(v) => formatCurrency(Number(v))} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12, fill: "var(--muted)" }} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} contentStyle={tooltipStyle} />
                  <Bar dataKey="value" name="Gasto" fill="var(--negative)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Parcelas a pagar nos próximos meses</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.upcomingInstallments} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} width={70} tickFormatter={(v) => formatCurrency(Number(v))} />
                <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} contentStyle={tooltipStyle} />
                <Bar dataKey="total" name="Parcelas" fill="var(--accent)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

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
