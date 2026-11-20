/**
 * Situação de pagamento de um lançamento, DERIVADA (não digitada):
 *
 * - Compra no cartão: depende da fatura em que caiu. Paga quando a fatura é
 *   paga; antes disso, "na fatura MM/AAAA", e "fatura vencida" depois do
 *   vencimento. A data de efetivação é o vencimento da fatura (ou o dia em que
 *   ela foi paga).
 * - Conta (débito, Pix, dinheiro, receita, transferência, pagamento de fatura,
 *   ajuste): pago quando a data de caixa (efetivação, se houver; senão a data
 *   do evento) já chegou; antes disso, "agendado".
 *
 * Função pura (sem banco), usada no servidor e na tela.
 */

export type PaymentStateValue = "PAID" | "SCHEDULED" | "ON_INVOICE" | "OVERDUE";

export type PaymentStateInput = {
  kind: string;
  eventDate: Date | string;
  settlementDate: Date | string | null;
  invoice?: {
    referenceYear: number;
    referenceMonth: number;
    dueDate: Date | string;
    status: string;
    paidAt: Date | string | null;
    paidCents?: number;
    totalCents?: number;
  } | null;
};

export type PaymentState = {
  state: PaymentStateValue;
  label: string;
  /** Data em que o dinheiro sai/entra (ISO, meia-noite UTC), ou null se desconhecida. */
  cashDate: string | null;
};

const toDate = (d: Date | string) => (typeof d === "string" ? new Date(d) : d);
const dayMs = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const label = (y: number, m: number) => `${String(m).padStart(2, "0")}/${y}`;

export function derivePaymentState(t: PaymentStateInput, today: Date): PaymentState {
  const todayMs = dayMs(today);

  if (t.kind === "CARD_PURCHASE") {
    const inv = t.invoice;
    if (!inv) return { state: "ON_INVOICE", label: "Na fatura", cashDate: null };
    const invLabel = label(inv.referenceYear, inv.referenceMonth);
    const due = toDate(inv.dueDate);
    const fullyPaid =
      inv.status === "PAID" && (inv.paidCents === undefined || inv.totalCents === undefined || inv.paidCents >= inv.totalCents);
    if (fullyPaid) {
      const paidAt = inv.paidAt ? toDate(inv.paidAt) : due;
      return { state: "PAID", label: "Pago", cashDate: new Date(dayMs(paidAt)).toISOString() };
    }
    if (dayMs(due) < todayMs) return { state: "OVERDUE", label: `Fatura ${invLabel} vencida`, cashDate: new Date(dayMs(due)).toISOString() };
    return { state: "ON_INVOICE", label: `Fatura ${invLabel}`, cashDate: new Date(dayMs(due)).toISOString() };
  }

  const cash = toDate(t.settlementDate ?? t.eventDate);
  const cashIso = new Date(dayMs(cash)).toISOString();
  if (dayMs(cash) <= todayMs) return { state: "PAID", label: t.kind === "INCOME" ? "Recebido" : "Pago", cashDate: cashIso };
  return { state: "SCHEDULED", label: "Agendado", cashDate: cashIso };
}

/** Status legado (coluna `status`) coerente com a situação derivada, para gravar. */
export function legacyStatusFor(state: PaymentStateValue): "PAGO" | "PENDENTE" {
  return state === "PAID" ? "PAGO" : "PENDENTE";
}
