"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { todayInputValue } from "@/lib/format";
import { formatCents, fromCents } from "@/lib/money";
import type { InvoiceView } from "@/lib/invoices/invoiceService";

const input =
  "rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent";

/**
 * Paga uma fatura a partir de uma conta. O pagamento sai do saldo da conta,
 * mas não entra como despesa — a despesa já foi contada em cada compra.
 */
export function PayInvoiceDialog({
  invoice,
  cardName,
  banks,
  onClose,
  onDone,
}: {
  invoice: InvoiceView;
  cardName: string;
  banks: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [bankId, setBankId] = useState(banks[0]?.id ?? "");
  const [amount, setAmount] = useState(fromCents(invoice.remainingCents).toFixed(2));
  const [paidAt, setPaidAt] = useState(todayInputValue());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankId, amount: Number(amount), paidAt }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Não foi possível registrar o pagamento.");
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
          <div>
            <h2 className="text-lg font-semibold text-foreground">Pagar fatura</h2>
            <p className="text-xs text-muted">
              {cardName} · {invoice.label} · em aberto {formatCents(invoice.remainingCents)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-surface-muted" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        {banks.length === 0 ? (
          <p className="text-sm text-muted">Cadastre uma conta em Bancos para pagar a fatura.</p>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Pagar com a conta
              <select value={bankId} onChange={(e) => setBankId(e.target.value)} className={input} required>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Valor (R$)
                <input type="number" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Data do pagamento
                <input type="date" required value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={input} />
              </label>
            </div>

            <p className="text-[11px] text-muted">
              O valor sai do saldo da conta e não conta de novo como despesa. Um valor menor que o total registra pagamento parcial.
            </p>

            {error && <p className="text-xs text-negative bg-negative-bg rounded-lg px-3 py-2">{error}</p>}

            <button type="submit" disabled={saving} className="rounded-lg bg-accent text-accent-foreground text-sm font-medium py-2.5 disabled:opacity-60">
              {saving ? "Registrando..." : "Confirmar pagamento"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
