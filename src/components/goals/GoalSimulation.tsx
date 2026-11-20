"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { X } from "lucide-react";
import { todayAsUtcDate } from "@/lib/format";
import { formatCents, toCents } from "@/lib/money";
import { monthsUntil, purchaseScenarios, shareOfFreeFlow, simulateGoal } from "@/lib/goals/goalCalculator";
import type { GoalView } from "@/lib/goals/goalService";
import { monthYearLabel, shareTone } from "./goalLabels";

const input = "rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent w-full";

function ShareText({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted">sem fluxo livre planejado para comparar</span>;
  const tone = shareTone(pct);
  return (
    <span className={clsx(tone === "negative" ? "text-negative" : tone === "warning" ? "text-warning-fg" : "text-muted")}>
      {pct.toLocaleString("pt-BR")}% do fluxo livre
    </span>
  );
}

/**
 * Cenários "e se" para uma meta. Nada aqui é salvo, exceto se o usuário
 * escolher usar um aporte como o planejado.
 */
export function GoalSimulation({
  goal,
  freeFlowCents,
  onClose,
  onApplyPlan,
}: {
  goal: GoalView;
  freeFlowCents: number;
  onClose: () => void;
  onApplyPlan: (monthlyReais: number) => Promise<void>;
}) {
  const today = todayAsUtcDate();
  const [monthly, setMonthly] = useState(goal.progress.monthlyNeededCents ? String(Math.ceil(goal.progress.monthlyNeededCents / 100)) : "");
  const [target, setTarget] = useState(String(goal.targetCents / 100));
  const [deadline, setDeadline] = useState(goal.targetDate ? goal.targetDate.slice(0, 7) : "");
  const [installments, setInstallments] = useState("10");
  const [applying, setApplying] = useState(false);

  const targetCents = toCents(target) || goal.targetCents;
  const monthlyCents = toCents(monthly);
  const byMonthly = monthlyCents > 0 ? simulateGoal({ targetCents, currentCents: goal.currentCents, today, monthlyCents }) : null;
  const deadlineDate = deadline ? new Date(Date.UTC(Number(deadline.slice(0, 4)), Number(deadline.slice(5, 7)), 0)) : null;
  const months = deadlineDate ? monthsUntil(today, deadlineDate) : 0;
  const byDeadline = months > 0 ? simulateGoal({ targetCents, currentCents: goal.currentCents, today, months }) : null;
  const purchase =
    goal.type === "PURCHASE"
      ? purchaseScenarios({ priceCents: targetCents, savedCents: goal.currentCents, monthsUntilPurchase: months || null, installments: Number(installments) || 1, freeFlowCents })
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={`Simular ${goal.name}`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Simular: {goal.name}</h2>
            <p className="text-xs text-muted">
              Guardado {formatCents(goal.currentCents)} · nada aqui altera a meta.
            </p>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-surface-muted" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {goal.type === "PURCHASE" ? "Preço (R$)" : "Valor da meta (R$)"}
          <input type="number" step="0.01" min="0.01" value={target} onChange={(e) => setTarget(e.target.value)} className={input} />
        </label>

        <section className="rounded-xl border border-border p-3 flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">E se eu guardar por mês…</h3>
          <input type="number" step="1" min="0" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="R$ por mês" className={input} aria-label="Aporte mensal" />
          {byMonthly && byMonthly.months !== null && (
            <p className="text-sm">
              {byMonthly.months === 0 ? (
                "A meta já está atingida."
              ) : (
                <>
                  Chega lá em <strong>{byMonthly.months} {byMonthly.months === 1 ? "mês" : "meses"}</strong> ({monthYearLabel(byMonthly.reachDate!)}) ·{" "}
                  <ShareText pct={shareOfFreeFlow(monthlyCents, freeFlowCents)} />
                </>
              )}
            </p>
          )}
          {monthlyCents > 0 && goal.currentSource === "CONTRIBUTIONS" && monthlyCents !== goal.monthlyPlanCents && (
            <button
              type="button"
              disabled={applying}
              onClick={async () => {
                setApplying(true);
                await onApplyPlan(monthlyCents / 100);
                setApplying(false);
              }}
              className="self-start rounded-lg border border-border text-xs font-medium px-3 py-1.5 hover:bg-surface-muted disabled:opacity-50"
            >
              Usar {formatCents(monthlyCents)}/mês como aporte planejado
            </button>
          )}
        </section>

        <section className="rounded-xl border border-border p-3 flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">E se o prazo for…</h3>
          <input type="month" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={input} aria-label="Novo prazo" />
          {byDeadline && byDeadline.monthlyCents !== null && (
            <p className="text-sm">
              {byDeadline.remainingCents === 0 ? (
                "A meta já está atingida."
              ) : (
                <>
                  Guardar <strong>{formatCents(byDeadline.monthlyCents)}/mês</strong> por {byDeadline.months} {byDeadline.months === 1 ? "mês" : "meses"} ·{" "}
                  <ShareText pct={shareOfFreeFlow(byDeadline.monthlyCents, freeFlowCents)} />
                </>
              )}
            </p>
          )}
          {deadline && months === 0 && <p className="text-sm text-negative">Essa data já passou.</p>}
        </section>

        {purchase && (
          <section className="rounded-xl border border-border p-3 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-foreground">Comprar à vista × parcelar</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-surface-muted p-3 flex flex-col gap-1">
                <span className="text-xs font-medium text-muted">Guardar e pagar à vista</span>
                {purchase.cash.monthlyCents !== null ? (
                  <>
                    <strong>{formatCents(purchase.cash.monthlyCents)}/mês</strong>
                    <span className="text-xs">por {purchase.cash.months} {purchase.cash.months === 1 ? "mês" : "meses"}, até a compra</span>
                    <span className="text-xs"><ShareText pct={purchase.cash.shareOfFreeFlow} /></span>
                  </>
                ) : (
                  <span className="text-xs text-muted">informe quando quer comprar</span>
                )}
              </div>
              <div className="rounded-lg bg-surface-muted p-3 flex flex-col gap-1">
                <span className="text-xs font-medium text-muted flex items-center gap-1">
                  Parcelar em
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={installments}
                    onChange={(e) => setInstallments(e.target.value)}
                    className="w-14 rounded border border-border bg-surface px-1.5 py-0.5 text-xs"
                    aria-label="Número de parcelas"
                  />
                  ×
                </span>
                <strong>{formatCents(purchase.installments.installmentCents)}/mês</strong>
                <span className="text-xs">por {purchase.installments.count} meses, depois da compra</span>
                <span className="text-xs"><ShareText pct={purchase.installments.shareOfFreeFlow} /></span>
              </div>
            </div>
            <p className="text-[11px] text-muted">Sem juros no cálculo: compare com o preço à vista e a taxa da loja. A decisão é de vocês.</p>
          </section>
        )}
      </div>
    </div>
  );
}
