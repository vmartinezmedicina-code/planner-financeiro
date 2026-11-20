"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { X } from "lucide-react";
import { todayAsUtcDate } from "@/lib/format";
import { formatCents, toCents } from "@/lib/money";
import { goalProgress, shareOfFreeFlow } from "@/lib/goals/goalCalculator";
import type { GoalView } from "@/lib/goals/goalService";
import { ChoiceChips } from "@/components/ui/ChoiceChips";
import { GOAL_TYPES, PRIORITIES, STRATEGIES, shareTone } from "./goalLabels";

type Option = { id: string; name: string; color?: string; balanceCents?: number };

const input = "rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent";

/** Criar ou editar uma meta, com o cálculo aparecendo enquanto preenche. */
export function GoalWizard({
  goal,
  banks,
  investments,
  freeFlowCents,
  onClose,
  onSaved,
}: {
  goal: GoalView | null;
  banks: Option[];
  investments: Option[];
  freeFlowCents: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(goal?.name ?? "");
  const [type, setType] = useState(goal?.type ?? "TRAVEL");
  const [target, setTarget] = useState(goal ? String(goal.targetCents / 100) : "");
  const [tracking, setTracking] = useState<"CONTRIBUTIONS" | "BANK" | "INVESTMENT">(goal?.currentSource ?? "CONTRIBUTIONS");
  const [initial, setInitial] = useState(goal && goal.initialCents ? String(goal.initialCents / 100) : "");
  const [bankId, setBankId] = useState(goal?.linkedBankId ?? "");
  const [investmentId, setInvestmentId] = useState(goal?.linkedInvestmentId ?? "");
  const [targetMonth, setTargetMonth] = useState(goal?.targetDate ? goal.targetDate.slice(0, 7) : "");
  const [strategy, setStrategy] = useState(goal?.strategy ?? "SAVE");
  const [priority, setPriority] = useState(goal?.priority ?? "MEDIUM");
  const [monthlyPlan, setMonthlyPlan] = useState(goal?.monthlyPlanCents ? String(goal.monthlyPlanCents / 100) : "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prévia do cálculo (mesma função do servidor).
  const targetCents = toCents(target);
  const contributionsSum = goal && goal.currentSource === "CONTRIBUTIONS" ? goal.currentCents - goal.initialCents : 0;
  const currentCents =
    tracking === "BANK"
      ? banks.find((b) => b.id === bankId)?.balanceCents ?? 0
      : tracking === "INVESTMENT"
        ? investments.find((i) => i.id === investmentId)?.balanceCents ?? 0
        : toCents(initial) + contributionsSum;
  const targetDate = targetMonth ? new Date(Date.UTC(Number(targetMonth.slice(0, 4)), Number(targetMonth.slice(5, 7)), 0)) : null;
  const preview = targetCents > 0 ? goalProgress({ targetCents, currentCents, targetDate, monthlyPlanCents: toCents(monthlyPlan) || null, today: todayAsUtcDate() }) : null;
  const share = preview?.monthlyNeededCents ? shareOfFreeFlow(preview.monthlyNeededCents, freeFlowCents) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (tracking === "BANK" && !bankId) return setError("Escolha a conta que a meta acompanha.");
    if (tracking === "INVESTMENT" && !investmentId) return setError("Escolha o investimento que a meta acompanha.");
    setSaving(true);
    const payload = {
      name: name.trim(),
      type,
      strategy,
      priority,
      description: description.trim() || null,
      targetAmount: Number(target) || 0,
      initialAmount: tracking === "CONTRIBUTIONS" ? Number(initial) || 0 : 0,
      targetDate: targetMonth || null,
      monthlyPlan: monthlyPlan ? Number(monthlyPlan) : null,
      linkedBankId: tracking === "BANK" ? bankId : null,
      linkedInvestmentId: tracking === "INVESTMENT" ? investmentId : null,
    };
    try {
      const res = await fetch(goal ? `/api/goals/${goal.id}` : "/api/goals", {
        method: goal ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json.error ?? "Não foi possível salvar a meta.");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={goal ? "Editar meta" : "Nova meta"}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <form onSubmit={submit} className="relative bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{goal ? "Editar meta" : "Nova meta"}</h2>
          <button type="button" onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-surface-muted" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Nome
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Viagem para Europa" className={input} />
        </label>

        <ChoiceChips label="Tipo" options={GOAL_TYPES.map((t) => ({ value: t.value, label: t.label }))} value={type} onChange={setType} />

        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {type === "PURCHASE" ? "Preço (R$)" : "Valor desejado (R$)"}
          <input type="number" step="0.01" min="0.01" required value={target} onChange={(e) => setTarget(e.target.value)} placeholder="30000" className={input} />
        </label>

        <ChoiceChips
          label="Como acompanhar o valor guardado"
          options={[
            { value: "CONTRIBUTIONS", label: "Registrar aportes" },
            { value: "BANK", label: "Saldo de uma conta" },
            { value: "INVESTMENT", label: "Valor de um investimento" },
          ]}
          value={tracking}
          onChange={(v) => setTracking(v as typeof tracking)}
        />
        {tracking === "CONTRIBUTIONS" && (
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Valor já reservado (R$)
            <input type="number" step="0.01" min="0" value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0,00" className={input} />
          </label>
        )}
        {tracking === "BANK" && (
          <ChoiceChips
            label="Conta da meta (o saldo dela é o valor guardado)"
            options={banks.map((b) => ({ value: b.id, label: b.name, color: b.color }))}
            value={bankId}
            onChange={setBankId}
            emptyText="Nenhuma conta cadastrada."
          />
        )}
        {tracking === "INVESTMENT" && (
          <ChoiceChips
            label="Investimento da meta (o valor atual dele é o valor guardado)"
            options={investments.map((i) => ({ value: i.id, label: i.name }))}
            value={investmentId}
            onChange={setInvestmentId}
            emptyText="Nenhum investimento cadastrado."
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {type === "PURCHASE" ? "Quando quer comprar" : "Data desejada"}
            <input type="month" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Aporte mensal planejado (opcional)
            <input type="number" step="0.01" min="0" value={monthlyPlan} onChange={(e) => setMonthlyPlan(e.target.value)} placeholder="R$ por mês" className={input} />
          </label>
        </div>

        <ChoiceChips label="Estratégia" columns={2} options={STRATEGIES} value={strategy} onChange={setStrategy} />
        <ChoiceChips label="Prioridade" columns={3} options={PRIORITIES} value={priority} onChange={setPriority} />

        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Observação (opcional)
          <input maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} className={input} />
        </label>

        {preview && (
          <div className="rounded-xl bg-accent/10 px-4 py-3 text-sm flex flex-col gap-1">
            <p>
              Guardado: <strong>{formatCents(currentCents)}</strong> ({preview.percent.toLocaleString("pt-BR")}%) · faltam{" "}
              <strong>{formatCents(preview.remainingCents)}</strong>
            </p>
            {preview.monthsLeft !== null && preview.monthlyNeededCents !== null && !preview.achieved && (
              <p>
                {preview.monthsLeft} {preview.monthsLeft === 1 ? "mês" : "meses"}: guardar <strong>{formatCents(preview.monthlyNeededCents)}/mês</strong>
                {preview.weeklyNeededCents ? <> (≈ {formatCents(preview.weeklyNeededCents)}/semana)</> : null}
              </p>
            )}
            {preview.overdue && <p className="text-negative">A data escolhida já passou.</p>}
            {share !== null && (
              <p className={clsx(shareTone(share) === "negative" ? "text-negative" : shareTone(share) === "warning" ? "text-warning-fg" : "text-muted")}>
                Isso consome cerca de {share.toLocaleString("pt-BR")}% do fluxo mensal livre ({formatCents(freeFlowCents)}).
              </p>
            )}
            {preview.achieved && <p className="text-positive">Meta já atingida com o valor guardado.</p>}
          </div>
        )}

        {error && <p className="text-xs text-negative bg-negative-bg rounded-lg px-3 py-2">{error}</p>}

        <button type="submit" disabled={saving} className="rounded-lg bg-accent text-accent-foreground text-sm font-medium py-2.5 disabled:opacity-60">
          {saving ? "Salvando..." : goal ? "Salvar alterações" : "Criar meta"}
        </button>
      </form>
    </div>
  );
}
