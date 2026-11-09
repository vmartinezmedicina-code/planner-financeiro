"use client";

import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { todayInputValue } from "@/lib/format";

type BankOption = { id: string; name: string };

const input =
  "rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent";

/** Transferência entre contas próprias: não é receita nem despesa, só move saldo. */
export function TransferDialog({ banks, onClose, onDone }: { banks: BankOption[]; onClose: () => void; onDone: () => void }) {
  const [fromBankId, setFromBankId] = useState(banks[0]?.id ?? "");
  const [toBankId, setToBankId] = useState(banks[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (fromBankId === toBankId) {
      setError("Escolha contas diferentes.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromBankId, toBankId, amount: Number(amount), date, description: description || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Não foi possível transferir.");
        return;
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 flex flex-col gap-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Transferir entre contas</h2>
          <button type="button" onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-surface-muted" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            De
            <select value={fromBankId} onChange={(e) => setFromBankId(e.target.value)} className={input} required>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <ArrowRight className="h-4 w-4 text-muted mb-3" />
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Para
            <select value={toBankId} onChange={(e) => setToBankId(e.target.value)} className={input} required>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Valor (R$)
            <input type="number" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className={input} placeholder="0,00" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Data
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Descrição (opcional)
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={input} placeholder="Ex: Reserva, pagar contas..." maxLength={120} />
        </label>

        <p className="text-[11px] text-muted">
          A transferência altera o saldo das duas contas, mas não conta como receita nem despesa.
        </p>

        {error && <p className="text-xs text-negative bg-negative-bg rounded-lg px-3 py-2">{error}</p>}

        <button type="submit" disabled={saving} className="rounded-lg bg-accent text-accent-foreground text-sm font-medium py-2.5 disabled:opacity-60">
          {saving ? "Transferindo..." : "Transferir"}
        </button>
      </form>
    </div>
  );
}
