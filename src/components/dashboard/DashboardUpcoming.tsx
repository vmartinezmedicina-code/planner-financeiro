"use client";

import { useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { CalendarClock } from "lucide-react";
import { formatDayMonth } from "@/lib/format";
import { formatCents } from "@/lib/money";
import type { DashboardData } from "@/lib/dashboard";

const PREVIEW = 5;

/**
 * O que vence nos próximos dias, a partir do que já está lançado: faturas
 * não pagas e lançamentos de conta com data futura.
 */
export function DashboardUpcoming({ upcoming }: { upcoming: DashboardData["upcoming"] }) {
  const [showAll, setShowAll] = useState(false);
  const items = showAll ? upcoming.items : upcoming.items.slice(0, PREVIEW);

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <CalendarClock className="h-4 w-4" /> Próximos {upcoming.days} dias
        </h2>
        {upcoming.items.length > 0 && (
          <span className="text-[11px] text-muted">
            a pagar {formatCents(upcoming.outflowCents)}
            {upcoming.inflowCents > 0 && ` · a receber ${formatCents(upcoming.inflowCents)}`}
          </span>
        )}
      </div>

      {upcoming.items.length === 0 ? (
        <p className="rounded-xl bg-surface-muted text-xs text-muted px-4 py-5 text-center">
          Nada a vencer. Lançamentos com data futura e faturas em aberto aparecem aqui.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {items.map((item) => (
            <Link key={item.id} href={item.href} className="py-2.5 flex items-center justify-between gap-3 hover:bg-surface-muted/60 -mx-2 px-2 rounded-lg">
              <span className="flex items-center gap-3 min-w-0">
                <span className={clsx("text-xs tabular-nums w-10 shrink-0", item.overdue ? "text-negative font-medium" : "text-muted")}>
                  {formatDayMonth(item.date)}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-foreground truncate">{item.label}</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-muted">
                    {item.overdue && <span className="text-negative bg-negative-bg rounded px-1.5 py-px">vencida</span>}
                    {item.detail && <span className="truncate">{item.detail}</span>}
                  </span>
                </span>
              </span>
              <span className={clsx("text-sm font-medium whitespace-nowrap tabular-nums", item.amountCents > 0 ? "text-positive" : "text-foreground")}>
                {formatCents(item.amountCents)}
              </span>
            </Link>
          ))}
        </div>
      )}

      {upcoming.items.length > PREVIEW && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-medium text-accent text-left">
          {showAll ? "Mostrar menos" : `Ver todos (${upcoming.items.length})`}
        </button>
      )}
    </section>
  );
}
