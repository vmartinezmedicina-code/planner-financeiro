import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveInvoicePeriod,
  referenceFor,
  periodForReference,
  deriveInvoiceStatus,
  daysInMonth,
} from "../src/lib/invoices/invoicePeriod";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const card = { closingDay: 10, dueDay: 20 };

describe("referenceFor — dia de fechamento inclusivo", () => {
  test("compra antes do fechamento cai na fatura do mês", () => {
    assert.deepEqual(referenceFor(card, d("2026-11-09")), { year: 2026, month: 11 });
  });
  test("compra no dia do fechamento ainda cai na fatura do mês", () => {
    assert.deepEqual(referenceFor(card, d("2026-11-10")), { year: 2026, month: 11 });
  });
  test("compra depois do fechamento cai na fatura seguinte", () => {
    assert.deepEqual(referenceFor(card, d("2026-11-11")), { year: 2026, month: 12 });
  });
  test("virada de ano: compra em dezembro após o fechamento vai para janeiro", () => {
    assert.deepEqual(referenceFor(card, d("2026-12-15")), { year: 2027, month: 1 });
    assert.deepEqual(referenceFor(card, d("2026-12-31")), { year: 2027, month: 1 });
  });
  test("fechamento 31 em mês de 30 dias usa o último dia", () => {
    const c = { closingDay: 31, dueDay: 10 };
    assert.deepEqual(referenceFor(c, d("2026-11-30")), { year: 2026, month: 11 });
    assert.deepEqual(referenceFor(c, d("2026-02-28")), { year: 2026, month: 2 });
  });
  test("sem dia de fechamento: fatura do mês da compra", () => {
    const c = { closingDay: null, dueDay: 15 };
    assert.deepEqual(referenceFor(c, d("2026-11-30")), { year: 2026, month: 11 });
    assert.deepEqual(referenceFor(c, d("2026-11-01")), { year: 2026, month: 11 });
  });
});

describe("periodForReference — datas", () => {
  test("fecha dia 10, vence dia 20 do mesmo mês", () => {
    const p = periodForReference(card, 2026, 11);
    assert.equal(p.openingDate.toISOString(), "2026-10-11T00:00:00.000Z");
    assert.equal(p.closingDate.toISOString(), "2026-11-10T00:00:00.000Z");
    assert.equal(p.dueDate.toISOString(), "2026-11-20T00:00:00.000Z");
  });
  test("vencimento antes do fechamento cai no mês seguinte", () => {
    const c = { closingDay: 25, dueDay: 5 };
    const p = periodForReference(c, 2026, 12);
    assert.equal(p.closingDate.toISOString(), "2026-12-25T00:00:00.000Z");
    assert.equal(p.dueDate.toISOString(), "2027-01-05T00:00:00.000Z");
    assert.equal(p.openingDate.toISOString(), "2026-11-26T00:00:00.000Z");
  });
  test("janeiro: abertura usa o fechamento de dezembro do ano anterior", () => {
    const p = periodForReference(card, 2027, 1);
    assert.equal(p.openingDate.toISOString(), "2026-12-11T00:00:00.000Z");
    assert.equal(p.closingDate.toISOString(), "2027-01-10T00:00:00.000Z");
  });
  test("sem fechamento/vencimento: fecha no fim do mês e vence dia 10 do seguinte", () => {
    const p = periodForReference({ closingDay: null, dueDay: null }, 2026, 2);
    assert.equal(p.openingDate.toISOString(), "2026-02-01T00:00:00.000Z");
    assert.equal(p.closingDate.toISOString(), "2026-02-28T00:00:00.000Z");
    assert.equal(p.dueDate.toISOString(), "2026-03-10T00:00:00.000Z");
  });
  test("vencimento 31 em mês curto é limitado", () => {
    const p = periodForReference({ closingDay: 20, dueDay: 31 }, 2026, 2);
    assert.equal(p.dueDate.toISOString(), "2026-02-28T00:00:00.000Z");
  });
  test("períodos consecutivos são contíguos (sem buraco nem sobreposição)", () => {
    for (let m = 1; m <= 11; m++) {
      const a = periodForReference(card, 2026, m);
      const b = periodForReference(card, 2026, m + 1);
      assert.equal(b.openingDate.getTime() - a.closingDate.getTime(), 86400000, `mês ${m}`);
    }
  });
});

describe("resolveInvoicePeriod — compra → fatura completa", () => {
  test("exemplo da especificação", () => {
    const p9 = resolveInvoicePeriod(card, d("2026-11-09"));
    const p11 = resolveInvoicePeriod(card, d("2026-11-11"));
    assert.equal(p9.referenceMonth, 11);
    assert.equal(p11.referenceMonth, 12);
    assert.equal(p11.dueDate.toISOString(), "2026-12-20T00:00:00.000Z");
  });
  test("toda compra cai dentro do próprio período [abertura, fechamento]", () => {
    for (let day = 1; day <= 31; day++) {
      const date = new Date(Date.UTC(2026, 11, Math.min(day, daysInMonth(2026, 12))));
      const p = resolveInvoicePeriod(card, date);
      assert.ok(date >= p.openingDate && date <= p.closingDate, date.toISOString());
    }
  });
});

describe("deriveInvoiceStatus", () => {
  const inv = { status: "OPEN" as const, closingDate: d("2026-11-10"), dueDate: d("2026-11-20"), totalCents: 10000, paidCents: 0 };
  test("aberta até o fechamento", () => {
    assert.equal(deriveInvoiceStatus(inv, d("2026-11-01")), "OPEN");
    assert.equal(deriveInvoiceStatus(inv, d("2026-11-10")), "OPEN");
  });
  test("fechada entre fechamento e vencimento", () => {
    assert.equal(deriveInvoiceStatus(inv, d("2026-11-11")), "CLOSED");
    assert.equal(deriveInvoiceStatus(inv, d("2026-11-20")), "CLOSED");
  });
  test("vencida depois do vencimento", () => {
    assert.equal(deriveInvoiceStatus(inv, d("2026-11-21")), "OVERDUE");
  });
  test("paga e parcial são persistidos", () => {
    assert.equal(deriveInvoiceStatus({ ...inv, status: "PAID" }, d("2026-12-01")), "PAID");
    assert.equal(deriveInvoiceStatus({ ...inv, paidCents: 4000 }, d("2026-12-01")), "PARTIAL");
  });
});
