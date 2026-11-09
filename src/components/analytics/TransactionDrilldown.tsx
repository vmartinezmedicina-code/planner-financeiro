"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { formatDayMonth } from "@/lib/format";
import { formatCents } from "@/lib/money";
import type { CategoryTransaction } from "@/lib/analytics/categoryAnalytics";

const PREVIEW = 8;

/** Lançamentos que compõem um total. Começa recolhida quando o nó tem subcategorias. */
export function TransactionDrilldown({
  transactions,
  total,
  startOpen,
  nodeName,
}: {
  transactions: CategoryTransaction[];
  total: number;
  startOpen: boolean;
  /** Nome do nó aberto: a categoria só aparece no lançamento quando é diferente dele. */
  nodeName?: string;
}) {
  const [open, setOpen] = useState(startOpen);
  const [showAll, setShowAll] = useState(false);

  if (total === 0) return <p className="text-xs text-muted">Nenhum lançamento neste mês.</p>;

  const visible = showAll ? transactions : transactions.slice(0, PREVIEW);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-xs font-medium text-accent"
      >
        {open ? "Ocultar" : "Ver"} lançamentos ({total})
      </button>

      {open && (
        <div className="mt-2 flex flex-col divide-y divide-border">
          {visible.map((t) => {
            const meta = [t.categoryName !== nodeName ? t.categoryName : null, t.where, t.memberName, t.installment ? `parcela ${t.installment}` : null].filter(Boolean).join(" · ");
            return (
              <div key={t.id} className="py-2 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="text-[11px] text-muted tabular-nums w-9 shrink-0 pt-0.5">{formatDayMonth(t.date)}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{t.description}</p>
                    {meta && <p className="text-[11px] text-muted truncate">{meta}</p>}
                  </div>
                </div>
                <span className={clsx("text-sm font-medium whitespace-nowrap tabular-nums", t.amountCents >= 0 ? "text-positive" : "text-foreground")}>
                  {formatCents(t.amountCents)}
                </span>
              </div>
            );
          })}
          {transactions.length > PREVIEW && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="pt-2 text-xs font-medium text-accent text-left">
              {showAll ? "Mostrar menos" : `Mostrar todos (${transactions.length})`}
            </button>
          )}
          {total > transactions.length && (
            <p className="pt-2 text-[11px] text-muted">Mostrando os {transactions.length} mais recentes de {total}.</p>
          )}
        </div>
      )}
    </div>
  );
}
