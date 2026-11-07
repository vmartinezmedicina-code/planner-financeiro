"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
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
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  CreditCard,
  Landmark,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { MonthYearSelector } from "@/components/MonthYearSelector";
import { BalanceCard } from "@/components/BalanceCard";
import { formatCompact, formatCurrency, MONTH_NAMES } from "@/lib/format";

type Breakdown = { name: string; value: number; children: { name: string; value: number }[] };

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
  despesaDeltaPct: number | null;
  receitaBreakdown: Breakdown[];
  despesaBreakdown: Breakdown[];
  cardInvoices: { label: string; open: number; dueDay: number | null }[];
};

type PanelKey = "contas" | "receitas" | "despesas" | "cartoes";

const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };

function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-surface-muted text-xs text-muted px-4 py-5 text-center">{children}</p>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  valueClass,
  hint,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueClass?: string;
  hint?: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={clsx(
        "text-left rounded-2xl border bg-surface p-4 sm:p-5 flex flex-col gap-1 transition-colors hover:bg-surface-muted",
        active ? "border-accent ring-1 ring-accent" : "border-border"
      )}
    >
      <span className="flex items-center justify-between text-xs font-medium text-muted">
        <span className="flex items-center gap-1.5">
          {icon} {label}
        </span>
        <ChevronDown className={clsx("h-4 w-4 transition-transform", active && "rotate-180")} />
      </span>
      <span className={clsx("text-xl font-semibold", valueClass ?? "text-foreground")}>{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </button>
  );
}

// Lista por setor: clique em uma categoria para ver as subcategorias.
function BreakdownList({ items, total, barClass }: { items: Breakdown[]; total: number; barClass: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (items.length === 0) return <p className="text-xs text-muted py-2">Sem lançamentos realizados neste mês.</p>;
  return (
    <div className="flex flex-col divide-y divide-border">
      {items.map((item) => {
        const pct = total > 0 ? (item.value / total) * 100 : 0;
        const isOpen = expanded === item.name;
        const canExpand = item.children.length > 0;
        return (
          <div key={item.name} className="py-2">
            <button
              type="button"
              disabled={!canExpand}
              onClick={() => setExpanded(isOpen ? null : item.name)}
              className="w-full text-left flex flex-col gap-1"
            >
              <span className="flex items-center justify-between text-sm gap-2">
                <span className="flex items-center gap-1 min-w-0">
                  {canExpand && (
                    <ChevronDown className={clsx("h-3.5 w-3.5 shrink-0 text-muted transition-transform", !isOpen && "-rotate-90")} />
                  )}
                  <span className="truncate font-medium">{item.name}</span>
                </span>
                <span className="whitespace-nowrap text-xs">
                  <span className="font-medium">{formatCurrency(item.value)}</span>
                  <span className="text-muted"> · {pct.toFixed(0)}%</span>
                </span>
              </span>
              <span className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
                <span className={clsx("block h-full rounded-full", barClass)} style={{ width: `${Math.min(100, pct)}%` }} />
              </span>
            </button>
            {isOpen && (
              <div className="mt-2 ml-5 flex flex-col gap-1">
                {item.children.map((c) => (
                  <div key={c.name} className="flex items-center justify-between text-xs text-muted">
                    <span className="truncate">{c.name}</span>
                    <span className="whitespace-nowrap">{formatCurrency(c.value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function DashboardBoard({ initialData, year, month }: { initialData: DashboardData; year: number; month: number }) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [panel, setPanel] = useState<PanelKey | null>(null);
  const [statementOpen, setStatementOpen] = useState(false);

  useEffect(() => setData(initialData), [initialData]);

  const reload = useCallback(async (y: number, m: number) => {
    const res = await fetch(`/api/dashboard?year=${y}&month=${m}`);
    if (res.ok) setData(await res.json());
  }, []);

  function handleMonthChange(y: number, m: number) {
    router.push(`/?year=${y}&month=${m}`);
    reload(y, m);
  }

  const toggle = (key: PanelKey) => setPanel((p) => (p === key ? null : key));
  const monthLabel = `${MONTH_NAMES[month - 1]} de ${year}`;
  const hasEvolution = data.evolution.some((e) => e.receita > 0 || e.despesa > 0);
  const hasInstallments = data.upcomingInstallments.some((p) => p.total > 0);
  const installmentsTotal = data.upcomingInstallments.reduce((acc, p) => acc + p.total, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <span className="text-xs text-muted">Receitas e despesas de {monthLabel}</span>
      </div>

      {data.dueAlerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {data.dueAlerts.map((a) => (
            <div key={a.card} className="flex items-center gap-2 rounded-xl bg-warning-bg text-warning-fg px-4 py-3 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Fatura <strong>{a.card}</strong> ({formatCurrency(a.open)} em aberto) vence{" "}
                {a.daysLeft === 0 ? "hoje" : a.daysLeft === 1 ? "amanhã" : `em ${a.daysLeft} dias`}.
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Painel principal: totais; toque para ver o detalhe */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          icon={<Landmark className="h-3.5 w-3.5" />}
          label="Saldo em contas"
          value={formatCurrency(data.totalBankBalance)}
          valueClass={data.totalBankBalance < 0 ? "text-negative" : "text-foreground"}
          hint={`${data.bankBalances.length} conta(s)`}
          active={panel === "contas"}
          onClick={() => toggle("contas")}
        />
        <SummaryCard
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Receitas do mês"
          value={formatCurrency(data.summary.totalReceitaRealized)}
          valueClass="text-positive"
          hint={`Planejado: ${formatCurrency(data.summary.totalReceitaPlanned)}`}
          active={panel === "receitas"}
          onClick={() => toggle("receitas")}
        />
        <SummaryCard
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          label="Despesas do mês"
          value={formatCurrency(data.summary.totalDespesaRealized)}
          valueClass="text-negative"
          hint={
            <>
              Planejado: {formatCurrency(data.summary.totalDespesaPlanned)}
              {data.despesaDeltaPct !== null && (
                <span
                  className={clsx(
                    "ml-1 inline-flex items-center gap-0.5 font-medium",
                    data.despesaDeltaPct > 0 ? "text-negative" : "text-positive"
                  )}
                >
                  {data.despesaDeltaPct > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(data.despesaDeltaPct).toFixed(0)}%
                </span>
              )}
            </>
          }
          active={panel === "despesas"}
          onClick={() => toggle("despesas")}
        />
        <SummaryCard
          icon={<CreditCard className="h-3.5 w-3.5" />}
          label="Cartões de crédito"
          value={formatCurrency(data.totalOpenInvoices)}
          hint="faturas em aberto"
          active={panel === "cartoes"}
          onClick={() => toggle("cartoes")}
        />
      </div>

      {panel && (
        <section className="rounded-2xl border border-border bg-surface p-4">
          {panel === "contas" && (
            <>
              <h2 className="text-sm font-semibold text-foreground mb-2">Saldo por conta</h2>
              <div className="flex flex-col divide-y divide-border">
                {data.bankBalances.map((b) => (
                  <div key={b.label} className="py-2 flex items-center justify-between text-sm">
                    <span>{b.label}</span>
                    <span className={clsx("font-medium", b.total < 0 && "text-negative")}>{formatCurrency(b.total)}</span>
                  </div>
                ))}
                {data.bankBalances.length === 0 && <p className="text-xs text-muted py-2">Nenhuma conta cadastrada.</p>}
              </div>
            </>
          )}
          {panel === "receitas" && (
            <>
              <h2 className="text-sm font-semibold text-foreground mb-2">Receitas por origem · {monthLabel}</h2>
              <BreakdownList items={data.receitaBreakdown} total={data.summary.totalReceitaRealized} barClass="bg-positive" />
            </>
          )}
          {panel === "despesas" && (
            <>
              <h2 className="text-sm font-semibold text-foreground mb-2">Despesas por setor · {monthLabel}</h2>
              <BreakdownList items={data.despesaBreakdown} total={data.summary.totalDespesaRealized} barClass="bg-negative" />
            </>
          )}
          {panel === "cartoes" && (
            <>
              <h2 className="text-sm font-semibold text-foreground mb-2">Fatura em aberto por cartão</h2>
              <div className="flex flex-col divide-y divide-border">
                {data.cardInvoices.map((c) => (
                  <div key={c.label} className="py-2 flex items-center justify-between text-sm">
                    <span>
                      {c.label}
                      {c.dueDay && <span className="text-xs text-muted"> · vence dia {c.dueDay}</span>}
                    </span>
                    <span className="font-medium">{formatCurrency(c.open)}</span>
                  </div>
                ))}
                {data.cardInvoices.length === 0 && <p className="text-xs text-muted py-2">Nenhum cartão cadastrado.</p>}
              </div>
            </>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Evolução de receitas e despesas</h2>
        {!hasEvolution ? (
          <EmptyChart>Ainda não há lançamentos nos últimos 6 meses.</EmptyChart>
        ) : (
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.evolution} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted)" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  width={64}
                  domain={[0, "auto"]}
                  allowDecimals={false}
                  tickFormatter={(v) => formatCompact(Number(v))}
                />
                <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="receita" name="Receitas" stroke="var(--positive)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="despesa" name="Despesas" stroke="var(--negative)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Parcelas a pagar nos próximos meses</h2>
          {hasInstallments && <span className="text-xs text-muted">{formatCurrency(installmentsTotal)} em 6 meses</span>}
        </div>
        {!hasInstallments ? (
          <EmptyChart>Nenhuma compra parcelada nos próximos 6 meses.</EmptyChart>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.upcomingInstallments} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted)" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  width={64}
                  domain={[0, "auto"]}
                  allowDecimals={false}
                  tickFormatter={(v) => formatCompact(Number(v))}
                />
                <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} contentStyle={tooltipStyle} />
                <Bar dataKey="total" name="Parcelas" fill="var(--accent)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Extrato mensal consolidado: aqui fica a escolha do mês */}
      <section className="rounded-2xl border border-border bg-surface">
        <button
          type="button"
          onClick={() => setStatementOpen((o) => !o)}
          aria-expanded={statementOpen}
          className="w-full flex items-center justify-between gap-2 p-4 text-left"
        >
          <span>
            <span className="block text-sm font-semibold text-foreground">Extrato mensal consolidado</span>
            <span className="block text-xs text-muted">{monthLabel} · planejado vs. realizado, contas e cartões</span>
          </span>
          <ChevronDown className={clsx("h-4 w-4 shrink-0 text-muted transition-transform", statementOpen && "rotate-180")} />
        </button>

        {statementOpen && (
          <div className="border-t border-border p-4 flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <MonthYearSelector year={year} month={month} onChange={handleMonthChange} />
            </div>

            <BalanceCard label={`Saldo do período · ${monthLabel}`} value={data.summary.realizedBalance} />

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Planejado vs. Realizado</h3>
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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Movimento por instituição</h3>
                <div className="flex flex-col divide-y divide-border">
                  {data.byBank.map((b) => (
                    <div key={b.label} className="py-2 flex items-center justify-between text-sm">
                      <span>{b.label}</span>
                      <span className={clsx("font-medium", b.total >= 0 ? "text-positive" : "text-negative")}>
                        {formatCurrency(b.total)}
                      </span>
                    </div>
                  ))}
                  {data.byBank.length === 0 && <p className="text-xs text-muted py-2">Sem movimento no mês.</p>}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Gastos por cartão</h3>
                <div className="flex flex-col divide-y divide-border">
                  {data.byCard.map((c) => (
                    <div key={c.label} className="py-2 flex items-center justify-between text-sm">
                      <span>{c.label}</span>
                      <span className={clsx("font-medium", c.total >= 0 ? "text-positive" : "text-negative")}>
                        {formatCurrency(c.total)}
                      </span>
                    </div>
                  ))}
                  {data.byCard.length === 0 && <p className="text-xs text-muted py-2">Sem gastos no mês.</p>}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
