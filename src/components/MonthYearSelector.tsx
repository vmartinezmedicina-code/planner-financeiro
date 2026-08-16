"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { MONTH_NAMES } from "@/lib/format";

export function MonthYearSelector({
  year,
  month,
  onChange,
}: {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}) {
  function shift(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    onChange(y, m);
  }

  return (
    <div className="flex items-center gap-1 bg-surface border border-border rounded-xl px-1.5 py-1">
      <button
        type="button"
        onClick={() => shift(-1)}
        className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-surface-muted transition"
        aria-label="Mês anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-sm font-medium text-foreground w-32 text-center select-none">
        {MONTH_NAMES[month - 1]} de {year}
      </span>
      <button
        type="button"
        onClick={() => shift(1)}
        className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-surface-muted transition"
        aria-label="Próximo mês"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
