import { addMonths, referenceFor, type InvoiceCardConfig } from "@/lib/invoices/invoicePeriod";
import { addMonthsUtc } from "./normalize";

/**
 * Onde cada linha importada de cartão vira lançamento (puro):
 * - Compra à vista: data impressa; fatura = a escolhida na importação, ou pela data.
 * - Parcela n/N: a data impressa costuma ser a da compra original. A parcela n vai
 *   para a fatura escolhida (ou para a fatura da compra + n−1 meses); as parcelas
 *   seguintes (n+1…N) vão uma por fatura, se a importação pedir parcelas futuras.
 *   Se a data impressa já cair na fatura escolhida (alguns bancos imprimem a data
 *   da parcela), a data original é recuada n−1 meses.
 * As parcelas ficam com data = original + (k−1) meses, como no cadastro manual.
 */

export type Ref = { year: number; month: number };

export type PlannedParcel = { number: number; eventDate: Date; invoiceRef: Ref | null };

export type CardPlan = {
  originalDate: Date;
  parcels: PlannedParcel[]; // à vista: um item com number 0
};

function sameRef(a: Ref, b: Ref): boolean {
  return a.year === b.year && a.month === b.month;
}

export function planCardItem(
  card: InvoiceCardConfig,
  fixedRef: Ref | null,
  item: { date: Date; installmentNumber: number | null; installmentTotal: number | null },
  createFuture: boolean
): CardPlan {
  const n = item.installmentNumber;
  const total = item.installmentTotal;
  if (!n || !total) {
    return { originalDate: item.date, parcels: [{ number: 0, eventDate: item.date, invoiceRef: fixedRef }] };
  }

  let original = item.date;
  if (fixedRef && n > 1 && sameRef(referenceFor(card, item.date), fixedRef)) original = addMonthsUtc(item.date, -(n - 1));

  const purchaseRef = referenceFor(card, original);
  const baseRef = fixedRef ?? addMonths(purchaseRef.year, purchaseRef.month, n - 1);
  const last = createFuture ? total : n;
  const parcels: PlannedParcel[] = [];
  for (let k = n; k <= last; k++) {
    parcels.push({ number: k, eventDate: addMonthsUtc(original, k - 1), invoiceRef: addMonths(baseRef.year, baseRef.month, k - n) });
  }
  return { originalDate: original, parcels };
}

/** Fatura em que a linha (ou a parcela n) cai — para mostrar na conferência. */
export function targetRefFor(card: InvoiceCardConfig, fixedRef: Ref | null, item: { date: Date; installmentNumber: number | null; installmentTotal: number | null }): Ref {
  const plan = planCardItem(card, fixedRef, item, false);
  return plan.parcels[0].invoiceRef ?? referenceFor(card, plan.parcels[0].eventDate);
}
