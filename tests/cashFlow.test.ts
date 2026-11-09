import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { projectCashFlow } from "../src/lib/finance/cashFlow";

const today = new Date("2026-11-08T00:00:00.000Z");
const iso = (d: string) => `${d}T00:00:00.000Z`;

describe("projectCashFlow", () => {
  test("sem compromissos, o projetado é o saldo de hoje", () => {
    const p = projectCashFlow(100000, [], today, 30);
    assert.equal(p.projectedCents, 100000);
    assert.equal(p.inflowCents, 0);
    assert.equal(p.outflowCents, 0);
    assert.equal(p.lowestDate, null);
  });

  test("soma entradas e saídas dentro do período", () => {
    const p = projectCashFlow(100000, [
      { date: iso("2026-11-10"), amountCents: -30000 },
      { date: iso("2026-11-20"), amountCents: 500000 },
      { date: iso("2026-11-26"), amountCents: -56835 },
    ], today, 30);
    assert.equal(p.inflowCents, 500000);
    assert.equal(p.outflowCents, 86835);
    assert.equal(p.projectedCents, 100000 + 500000 - 86835);
  });

  test("ignora o que está além do horizonte", () => {
    const p = projectCashFlow(0, [
      { date: iso("2026-12-08"), amountCents: -100 }, // dia 30: entra
      { date: iso("2026-12-09"), amountCents: -999 }, // dia 31: fora
    ], today, 30);
    assert.equal(p.outflowCents, 100);
  });

  test("vencidos pesam a partir de hoje", () => {
    const p = projectCashFlow(10000, [{ date: iso("2026-10-26"), amountCents: -8990 }], today, 30);
    assert.equal(p.projectedCents, 1010);
    assert.equal(p.points[0].date, today.toISOString());
  });

  test("aponta o menor saldo e quando ele acontece, mesmo que o final seja positivo", () => {
    const p = projectCashFlow(50000, [
      { date: iso("2026-11-10"), amountCents: -80000 }, // fica -300,00
      { date: iso("2026-11-15"), amountCents: 200000 }, // recupera
    ], today, 30);
    assert.equal(p.projectedCents, 170000);
    assert.equal(p.lowestCents, -30000);
    assert.equal(p.lowestDate, iso("2026-11-10"));
  });

  test("movimentos do mesmo dia são somados antes de avaliar o menor saldo", () => {
    const p = projectCashFlow(1000, [
      { date: iso("2026-11-10"), amountCents: -5000 },
      { date: iso("2026-11-10"), amountCents: 5000 },
    ], today, 30);
    assert.equal(p.lowestCents, 1000);
    assert.equal(p.points.length, 1);
  });
});
