"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { todayInputValue } from "@/lib/format";
import type { GoalView } from "@/lib/goals/goalService";
import { ChoiceChips } from "@/components/ui/ChoiceChips";
import { CONTRIBUTION_SOURCES } from "./goalLabels";

const input = "rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent";

/** Registrar aporte ou retirada numa meta. É só um registro da meta. */
export function GoalContributionForm({ goal, onClose, onSaved }: { goal: GoalView; onClose: () => void; onSaved: () => void }) {
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState(goal.monthlyPlanCents ? String(goal.monthlyPlanCents / 100) : "");
  const [date, setDate] = useState(todayInputValue());
  const [source, setSource] = useState("SAVINGS");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!value || value <= 0) return setError("Informe um valor.");
    setSaving(true);
    try {
      const res = await fetch(`/api/goals/${goal.id}/contributions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: direction === "in" ? value : -value, date, source, note: note.trim() || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json.error ?? "Não foi possível registrar.");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={`Aporte em ${goal.name}`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <form onSubmit={submit} className="relative bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{goal.name}</h2>
          <button type="button" onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-surface-muted" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <ChoiceChips
          label="Movimento"
          columns={2}
          options={[
            { value: "in", label: "Aporte" },
            { value: "out", label: "Retirada" },
          ]}
          value={direction}
          onChange={(v) => setDirection(v as "in" | "out")}
        />

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Valor (R$)
            <input type="number" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Data
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </label>
        </div>

        {direction === "in" && <ChoiceChips label="De onde veio" columns={2} options={CONTRIBUTION_SOURCES} value={source} onChange={setSource} />}

        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Observação (opcional)
          <input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} className={input} />
        </label>

        <p className="text-[11px] text-muted">
          É só um registro da meta: não mexe no saldo das contas. Para mover dinheiro entre contas, use Transferir em Bancos.
        </p>

        {error && <p className="text-xs text-negative bg-negative-bg rounded-lg px-3 py-2">{error}</p>}

        <button type="submit" disabled={saving} className="rounded-lg bg-accent text-accent-foreground text-sm font-medium py-2.5 disabled:opacity-60">
          {saving ? "Salvando..." : direction === "in" ? "Registrar aporte" : "Registrar retirada"}
        </button>
      </form>
    </div>
  );
}
