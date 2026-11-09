"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { formatCompact, formatCurrency, shortMonthLabel } from "@/lib/format";
import { fromCents } from "@/lib/money";
import type { DashboardData } from "@/lib/dashboard";

const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };

/** Evolução de receitas × despesas (competência). Clicar em um mês abre aquele mês. */
export function DashboardCashFlow({
  evolution,
  onSelectMonth,
}: {
  evolution: DashboardData["evolution"];
  onSelectMonth: (year: number, month: number) => void;
}) {
  const points = evolution.map((e) => ({
    label: shortMonthLabel(e.year, e.month),
    receita: fromCents(e.receitaCents),
    despesa: fromCents(e.despesaCents),
  }));
  const hasData = evolution.some((e) => e.receitaCents > 0 || e.despesaCents > 0);

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Receitas e despesas</h2>
        {hasData && <span className="text-[11px] text-muted">toque em um mês para abrir</span>}
      </div>
      {!hasData ? (
        <p className="rounded-xl bg-surface-muted text-xs text-muted px-4 py-5 text-center">Ainda não há lançamentos nos últimos 6 meses.</p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={{ left: 4, right: 8, top: 4 }}
              onClick={(state) => {
                const idx = Number(state?.activeTooltipIndex);
                const target = Number.isInteger(idx) ? evolution[idx] : undefined;
                if (target) onSelectMonth(target.year, target.month);
              }}
              style={{ cursor: "pointer" }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted)" }} />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                width={62}
                domain={[0, "auto"]}
                allowDecimals={false}
                tickFormatter={(v) => formatCompact(Number(v))}
              />
              <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="receita" name="Receitas" stroke="var(--positive)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="despesa" name="Despesas" stroke="var(--negative)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
