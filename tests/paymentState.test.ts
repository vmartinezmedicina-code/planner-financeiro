import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { derivePaymentState } from "../src/lib/finance/paymentState";
import { deriveInvoiceStatus } from "../src/lib/invoices/invoicePeriod";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const today = d("2026-11-19");
const inv = (over: Partial<{ referenceMonth: number; status: string; dueDate: Date; paidAt: Date | null; paidCents: number; totalCents: number }> = {}) => ({
  referenceYear: 2026,
  referenceMonth: 12,
  dueDate: d("2026-12-26"),
  status: "OPEN",
  paidAt: null,
  paidCents: 0,
  totalCents: 10000,
  ...over,
});

describe("compra no cartão", () => {
  test("fatura não paga: situação é a fatura e a efetivação é o vencimento", () => {
    const s = derivePaymentState({ kind: "CARD_PURCHASE", eventDate: d("2026-11-15"), settlementDate: null, invoice: inv() }, today);
    assert.equal(s.state, "ON_INVOICE");
    assert.equal(s.label, "Fatura 12/2026");
    assert.equal(s.cashDate, "2026-12-26T00:00:00.000Z");
  });

  test("fatura paga: pago, com a data do pagamento", () => {
    const s = derivePaymentState(
      { kind: "CARD_PURCHASE", eventDate: d("2026-11-15"), settlementDate: null, invoice: inv({ status: "PAID", paidAt: d("2026-12-20"), paidCents: 10000 }) },
      d("2026-12-21")
    );
    assert.equal(s.state, "PAID");
    assert.equal(s.cashDate, "2026-12-20T00:00:00.000Z");
  });

  test("compra nova numa fatura já paga volta a ficar em aberto", () => {
    const s = derivePaymentState(
      { kind: "CARD_PURCHASE", eventDate: d("2026-11-15"), settlementDate: null, invoice: inv({ status: "PAID", paidAt: d("2026-12-20"), paidCents: 10000, totalCents: 15000 }) },
      today
    );
    assert.equal(s.state, "ON_INVOICE");
  });

  test("fatura vencida sem pagamento", () => {
    const s = derivePaymentState({ kind: "CARD_PURCHASE", eventDate: d("2026-10-01"), settlementDate: null, invoice: inv({ referenceMonth: 10, dueDate: d("2026-10-26") }) }, today);
    assert.equal(s.state, "OVERDUE");
    assert.equal(s.label, "Fatura 10/2026 vencida");
  });

  test("sem fatura ligada", () => {
    assert.equal(derivePaymentState({ kind: "CARD_PURCHASE", eventDate: d("2026-11-15"), settlementDate: null, invoice: null }, today).state, "ON_INVOICE");
  });
});

describe("conta (débito, Pix, dinheiro, receita)", () => {
  test("data de hoje ou passada já está paga", () => {
    assert.equal(derivePaymentState({ kind: "EXPENSE", eventDate: d("2026-11-19"), settlementDate: null }, today).state, "PAID");
    assert.equal(derivePaymentState({ kind: "EXPENSE", eventDate: d("2026-11-01"), settlementDate: null }, today).label, "Pago");
    assert.equal(derivePaymentState({ kind: "INCOME", eventDate: d("2026-11-05"), settlementDate: null }, today).label, "Recebido");
  });

  test("data futura fica agendada", () => {
    const s = derivePaymentState({ kind: "EXPENSE", eventDate: d("2026-11-25"), settlementDate: null }, today);
    assert.equal(s.state, "SCHEDULED");
    assert.equal(s.cashDate, "2026-11-25T00:00:00.000Z");
  });

  test("data de efetivação manda sobre a data do evento", () => {
    assert.equal(derivePaymentState({ kind: "EXPENSE", eventDate: d("2026-11-10"), settlementDate: d("2026-11-30") }, today).state, "SCHEDULED");
    assert.equal(derivePaymentState({ kind: "EXPENSE", eventDate: d("2026-11-30"), settlementDate: d("2026-11-10") }, today).state, "PAID");
  });
});

describe("fatura paga que recebe compra nova", () => {
  test("status deixa de ser 'paga' e vira 'paga em parte'", () => {
    const status = deriveInvoiceStatus({ status: "PAID", closingDate: d("2026-12-10"), dueDate: d("2026-12-26"), totalCents: 15000, paidCents: 10000 }, today);
    assert.equal(status, "PARTIAL");
  });
});
