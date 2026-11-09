"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { MONTH_NAMES, todayInputValue } from "@/lib/format";

/** Cabeçalho do dashboard: ‹ Mês Ano ›, voltar para o mês atual e atalho para lançar. */
export function DashboardHeader({
  year,
  month,
  isCurrentMonth,
  onChange,
}: {
  year: number;
  month: number;
  isCurrentMonth: boolean;
  onChange: (year: number, month: number) => void;
}) {
  function shift(delta: number) {
    const idx = year * 12 + (month - 1) + delta;
    onChange(Math.floor(idx / 12), (idx % 12) + 1);
  }

  function goToday() {
    const [y, m] = todayInputValue().split("-").map(Number);
    onChange(y, m);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5 bg-surface border border-border rounded-xl px-1 py-1">
          <button
            type="button"
            onClick={() => shift(-1)}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-surface-muted transition"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h1 className="text-base font-semibold text-foreground min-w-[9.5rem] text-center select-none" aria-live="polite">
            {MONTH_NAMES[month - 1]} {year}
          </h1>
          <button
            type="button"
            onClick={() => shift(1)}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-surface-muted transition"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {!isCurrentMonth && (
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg border border-border text-xs font-medium px-3 py-2 hover:bg-surface-muted"
          >
            Mês atual
          </button>
        )}
      </div>

      <Link
        href="/lancamentos?novo=1"
        className="flex items-center gap-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium px-3 py-2"
      >
        <Plus className="h-3.5 w-3.5" /> Novo lançamento
      </Link>
    </div>
  );
}
