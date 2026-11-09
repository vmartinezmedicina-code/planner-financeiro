"use client";

import { clsx } from "clsx";
import { formatDate } from "@/lib/format";
import { formatCents } from "@/lib/money";
import type { InvoiceView } from "@/lib/invoices/invoiceService";

const STATUS_LABEL: Record<InvoiceView["status"], string> = {
  OPEN: "Aberta",
  CLOSED: "Fechada",
  PAID: "Paga",
  PARTIAL: "Paga em parte",
  OVERDUE: "Vencida",
};

const STATUS_CLASS: Record<InvoiceView["status"], string> = {
  OPEN: "bg-accent/10 text-accent",
  CLOSED: "bg-warning-bg text-warning-fg",
  PAID: "bg-positive-bg text-positive",
  PARTIAL: "bg-warning-bg text-warning-fg",
  OVERDUE: "bg-negative-bg text-negative",
};

export function InvoiceStatusBadge({ status }: { status: InvoiceView["status"] }) {
  return <span className={clsx("text-[11px] rounded-full px-2 py-0.5 whitespace-nowrap", STATUS_CLASS[status])}>{STATUS_LABEL[status]}</span>;
}

/** Lista de faturas de um cartão, da mais recente para a mais antiga. */
export function InvoiceList({ invoices, onPay }: { invoices: InvoiceView[]; onPay: (invoice: InvoiceView) => void }) {
  if (invoices.length === 0) return <p className="text-xs text-muted py-2">Nenhuma fatura ainda. Ela é criada na primeira compra no cartão.</p>;

  return (
    <div className="flex flex-col divide-y divide-border">
      {invoices.map((inv) => (
        <div key={inv.id} className="py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{inv.label}</span>
              <InvoiceStatusBadge status={inv.status} />
            </div>
            <p className="text-[11px] text-muted mt-0.5">
              Fecha {formatDate(inv.closingDate)} · vence {formatDate(inv.dueDate)} · {inv.purchaseCount} compra(s)
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">{formatCents(inv.totalCents)}</p>
              {inv.paidCents > 0 && inv.status !== "PAID" && (
                <p className="text-[11px] text-muted">falta {formatCents(inv.remainingCents)}</p>
              )}
            </div>
            {inv.status !== "PAID" && inv.remainingCents > 0 && (
              <button
                type="button"
                onClick={() => onPay(inv)}
                className="rounded-lg border border-border text-xs font-medium px-2.5 py-1.5 hover:bg-surface-muted"
              >
                {inv.status === "OPEN" ? "Antecipar" : "Pagar"}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
