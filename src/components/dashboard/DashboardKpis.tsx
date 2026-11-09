"use client";

import type { ReactNode } from "react";
import { clsx } from "clsx";
import { ArrowDownRight, ArrowUpRight, ChevronRight, CreditCard, Landmark, TrendingDown, TrendingUp } from "lucide-react";
import { formatDayMonth } from "@/lib/format";
import { formatCents } from "@/lib/money";
import type { DashboardData } from "@/lib/dashboard";

export type DrawerView = "saldo" | "receitas" | "despesas" | "cartoes";

function KpiCard({
  icon,
  label,
  value,
  valueClass,
  hint,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueClass?: string;
  hint: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left rounded-2xl border border-border bg-surface p-4 sm:p-5 flex flex-col gap-1 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="flex items-center justify-between text-xs font-medium text-muted">
        <span className="flex items-center gap-1.5 min-w-0">
          {icon} <span className="truncate">{label}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 opacity-50 group-hover:opacity-100" />
      </span>
      <span className={clsx("text-xl sm:text-2xl font-semibold tabular-nums", valueClass ?? "text-foreground")}>{value}</span>
      <span className="text-xs text-muted">{hint}</span>
    </button>
  );
}

function Delta({ pct, upIsBad }: { pct: number | null; upIsBad: boolean }) {
  if (pct === null || pct === 0) return null;
  const up = pct > 0;
  const bad = upIsBad ? up : !up;
  return (
    <span className={clsx("ml-1 inline-flex items-center gap-0.5 font-medium", bad ? "text-negative" : "text-positive")}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
    </span>
  );
}

/** Os quatro indicadores principais. Cada um abre o painel de detalhe. */
export function DashboardKpis({ data, onOpen }: { data: DashboardData; onOpen: (view: DrawerView) => void }) {
  const { period, balance, cards } = data;
  const accounts = balance.accounts.length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard
        icon={<Landmark className="h-3.5 w-3.5 shrink-0" />}
        label="Saldo disponível"
        value={formatCents(balance.totalCents)}
        valueClass={balance.totalCents < 0 ? "text-negative" : "text-foreground"}
        hint={accounts === 0 ? "nenhuma conta cadastrada" : `hoje · ${accounts} conta${accounts > 1 ? "s" : ""}`}
        onClick={() => onOpen("saldo")}
      />
      <KpiCard
        icon={<TrendingUp className="h-3.5 w-3.5 shrink-0" />}
        label="Receitas do mês"
        value={formatCents(period.receitaRealizedCents)}
        valueClass="text-positive"
        hint={
          <>
            {period.receitaPlannedCents > 0 ? `de ${formatCents(period.receitaPlannedCents)} planejado` : "sem planejamento"}
            <Delta pct={period.receitaChangePct} upIsBad={false} />
          </>
        }
        onClick={() => onOpen("receitas")}
      />
      <KpiCard
        icon={<TrendingDown className="h-3.5 w-3.5 shrink-0" />}
        label="Despesas do mês"
        value={formatCents(period.despesaRealizedCents)}
        valueClass="text-negative"
        hint={
          <>
            {period.despesaPlannedCents > 0 ? `de ${formatCents(period.despesaPlannedCents)} planejado` : "sem planejamento"}
            <Delta pct={period.despesaChangePct} upIsBad />
          </>
        }
        onClick={() => onOpen("despesas")}
      />
      <KpiCard
        icon={<CreditCard className="h-3.5 w-3.5 shrink-0" />}
        label="Cartões"
        value={formatCents(cards.openCents)}
        hint={
          cards.nextDue
            ? `próxima: ${cards.nextDue.card} · vence ${formatDayMonth(cards.nextDue.dueDate)}`
            : "nenhuma fatura em aberto"
        }
        onClick={() => onOpen("cartoes")}
      />
    </div>
  );
}

function SecondaryItem({ label, value, hint, tone }: { label: string; value: string; hint?: ReactNode; tone?: "negative" | "default" }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="text-[11px] font-medium text-muted truncate">{label}</dt>
      <dd className={clsx("text-sm font-semibold tabular-nums", tone === "negative" ? "text-negative" : "text-foreground")}>{value}</dd>
      {hint && <dd className="text-[11px] text-muted">{hint}</dd>}
    </div>
  );
}

/** Indicadores secundários: discretos, só leitura. */
export function DashboardSecondary({ data }: { data: DashboardData }) {
  const { period, upcoming, projection } = data;
  const used = period.budgetUsedPct;
  const overBudget = used !== null && used > 100;
  const goesNegative = projection.lowestCents < 0 && projection.lowestDate !== null;

  return (
    <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3 rounded-2xl border border-border bg-surface px-4 sm:px-5 py-3.5">
      <SecondaryItem
        label="Orçamento utilizado"
        value={used === null ? "—" : `${used.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`}
        tone={overBudget ? "negative" : "default"}
        hint={
          used === null ? (
            "sem orçamento neste mês"
          ) : (
            <span className="block h-1 mt-1 rounded-full bg-surface-muted overflow-hidden">
              <span className={clsx("block h-full rounded-full", overBudget ? "bg-negative" : "bg-accent")} style={{ width: `${Math.min(100, used)}%` }} />
            </span>
          )
        }
      />
      <SecondaryItem
        label="Receitas previstas"
        value={formatCents(period.expectedIncomeCents)}
        hint="ainda por entrar neste mês"
      />
      <SecondaryItem
        label={`A vencer em ${upcoming.days} dias`}
        value={formatCents(upcoming.outflowCents)}
        hint={upcoming.outflowCount === 0 ? "nada lançado" : `${upcoming.outflowCount} compromisso${upcoming.outflowCount > 1 ? "s" : ""}`}
      />
      <SecondaryItem
        label={`Saldo projetado em ${projection.days} dias`}
        value={formatCents(projection.projectedCents)}
        tone={projection.projectedCents < 0 ? "negative" : "default"}
        hint={
          goesNegative ? (
            <span className="text-negative">pode ficar negativo em {formatDayMonth(projection.lowestDate!)}</span>
          ) : (
            "saldo de hoje + entradas − saídas já lançadas"
          )
        }
      />
    </dl>
  );
}
