"use client";

import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Download, Printer } from "lucide-react";
import { MonthYearSelector } from "@/components/MonthYearSelector";
import { formatCurrency, MONTH_NAMES } from "@/lib/format";

type Row = { id: string; name: string; depth: number; planned: number; realized: number };

type Props = {
  year: number;
  month: number;
  summary: {
    plannedBalance: number;
    realizedBalance: number;
    totalReceitaPlanned: number;
    totalReceitaRealized: number;
    totalDespesaPlanned: number;
    totalDespesaRealized: number;
  };
  receitas: Row[];
  despesas: Row[];
};

function Table({ title, rows, tone }: { title: string; rows: Row[]; tone: "positive" | "negative" }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 break-inside-avoid">
      <h2 className={clsx("text-sm font-semibold mb-2", tone === "positive" ? "text-positive" : "text-negative")}>
        {title}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-border">
              <th className="py-1.5 pr-2">Categoria</th>
              <th className="py-1.5 px-2 text-right">Planejado</th>
              <th className="py-1.5 px-2 text-right">Realizado</th>
              <th className="py-1.5 pl-2 text-right">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const diff = r.planned - r.realized;
              return (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td
                    className={clsx("py-1.5 pr-2", r.depth === 0 && "font-semibold")}
                    style={{ paddingLeft: r.depth * 14 }}
                  >
                    {r.name}
                  </td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap">{formatCurrency(r.planned)}</td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap">{formatCurrency(r.realized)}</td>
                  <td
                    className={clsx(
                      "py-1.5 pl-2 text-right whitespace-nowrap",
                      r.planned === 0 && r.realized === 0 ? "text-muted" : diff >= 0 ? "text-positive" : "text-negative"
                    )}
                  >
                    {formatCurrency(diff)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ReportBoard({ year, month, summary, receitas, despesas }: Props) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-xl font-semibold text-foreground">Relatórios</h1>
        <MonthYearSelector year={year} month={month} onChange={(y, m) => router.push(`/relatorios?year=${y}&month=${m}`)} />
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        <a
          href={`/api/reports/excel?year=${year}&month=${month}`}
          className="flex items-center gap-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium px-3 py-2"
        >
          <Download className="h-3.5 w-3.5" /> Baixar Excel (.xlsx)
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-lg border border-border text-xs font-medium px-3 py-2"
        >
          <Printer className="h-3.5 w-3.5" /> Imprimir / salvar PDF
        </button>
      </div>

      <h2 className="hidden print:block text-lg font-semibold">
        Planner Financeiro — {MONTH_NAMES[month - 1]} de {year}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs text-muted">Receitas (realizado / planejado)</p>
          <p className="text-lg font-semibold text-positive">{formatCurrency(summary.totalReceitaRealized)}</p>
          <p className="text-xs text-muted">{formatCurrency(summary.totalReceitaPlanned)} planejado</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs text-muted">Despesas (realizado / planejado)</p>
          <p className="text-lg font-semibold text-negative">{formatCurrency(summary.totalDespesaRealized)}</p>
          <p className="text-xs text-muted">{formatCurrency(summary.totalDespesaPlanned)} planejado</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs text-muted">Saldo do mês</p>
          <p className={clsx("text-lg font-semibold", summary.realizedBalance >= 0 ? "text-positive" : "text-negative")}>
            {formatCurrency(summary.realizedBalance)}
          </p>
          <p className="text-xs text-muted">{formatCurrency(summary.plannedBalance)} planejado</p>
        </div>
      </div>

      <Table title="Receitas por categoria" rows={receitas} tone="positive" />
      <Table title="Despesas por categoria" rows={despesas} tone="negative" />
    </div>
  );
}
