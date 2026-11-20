import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { budgetStatus, classifyNature, monthProgress } from "../src/lib/analytics/budgetPace";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("monthProgress", () => {
  test("mês corrente, passado e futuro", () => {
    assert.equal(monthProgress(2026, 11, d("2026-11-15")), 0.5);
    assert.equal(monthProgress(2026, 10, d("2026-11-15")), 1);
    assert.equal(monthProgress(2025, 12, d("2026-01-10")), 1);
    assert.equal(monthProgress(2026, 12, d("2026-11-15")), 0);
    assert.equal(monthProgress(2027, 1, d("2026-12-31")), 0);
  });
});

describe("budgetStatus — gasto variável", () => {
  const v = (realized: number, progress: number, planned = 100000) => budgetStatus({ plannedCents: planned, realizedCents: realized, progress, nature: "VARIABLE" })!;

  test("80% no dia 10 acende o amarelo", () => {
    const s = v(80000, 10 / 30);
    assert.equal(s.state, "WARNING");
    assert.equal(s.reason, "80% gasto com 33% do mês");
  });
  test("85% no dia 28 está no ritmo", () => {
    assert.equal(v(85000, 28 / 30).state, "OK");
  });
  test("abaixo de 80% nunca é amarelo, mesmo adiantado", () => {
    assert.equal(v(70000, 0.1).state, "OK");
  });
  test("na margem de 10 pontos não alerta", () => {
    assert.equal(v(85000, 0.76).state, "OK");
    assert.equal(v(87000, 0.76).state, "WARNING");
  });
  test("acima do planejado é vermelho, com o excedente", () => {
    const s = v(106000, 0.5);
    assert.equal(s.state, "OVER");
    assert.match(s.reason, /60,00 acima do planejado/);
  });
  test("projeção de fechamento no ritmo atual", () => {
    assert.equal(v(50000, 0.5).projectedCents, 100000);
    assert.equal(v(10000, 0.1).projectedCents, null, "cedo demais para projetar");
  });
  test("mês encerrado: 95% é ok, só passar do planejado acende", () => {
    assert.equal(v(95000, 1).state, "OK");
    assert.equal(v(101000, 1).state, "OVER");
  });
  test("sem planejado não há status", () => {
    assert.equal(budgetStatus({ plannedCents: 0, realizedCents: 5000, progress: 0.5, nature: "VARIABLE" }), null);
  });
});

describe("budgetStatus — conta fixa", () => {
  test("aluguel pago no dia 5 (100%) não acende", () => {
    const s = budgetStatus({ plannedCents: 250000, realizedCents: 250000, progress: 5 / 30, nature: "FIXED" })!;
    assert.equal(s.state, "OK");
    assert.equal(s.projectedCents, null);
  });
  test("conta fixa acima do planejado acende o vermelho", () => {
    assert.equal(budgetStatus({ plannedCents: 250000, realizedCents: 262000, progress: 0.2, nature: "FIXED" })!.state, "OVER");
  });
});

describe("classifyNature", () => {
  const base = { previousCounts: [] as number[], currentCount: 0, currentRecurringCount: 0, realizedCents: 0, plannedCents: 100000 };
  test("uma compra por mês no histórico é fixa", () => {
    assert.equal(classifyNature({ ...base, previousCounts: [1, 1, 1], currentCount: 1 }), "FIXED");
  });
  test("várias compras por mês é variável", () => {
    assert.equal(classifyNature({ ...base, previousCounts: [5, 8, 6], currentCount: 3 }), "VARIABLE");
  });
  test("meses sem gasto não contam na média", () => {
    assert.equal(classifyNature({ ...base, previousCounts: [0, 1, 0], currentCount: 1 }), "FIXED");
  });
  test("tudo vindo de lançamento recorrente é fixo", () => {
    assert.equal(classifyNature({ ...base, previousCounts: [3, 4], currentCount: 2, currentRecurringCount: 2 }), "FIXED");
  });
  test("sem histórico: um lançamento que cobre o planejado é fixo; senão variável", () => {
    assert.equal(classifyNature({ ...base, currentCount: 1, realizedCents: 95000 }), "FIXED");
    assert.equal(classifyNature({ ...base, currentCount: 1, realizedCents: 30000 }), "VARIABLE");
    assert.equal(classifyNature({ ...base, currentCount: 4, realizedCents: 95000 }), "VARIABLE");
  });
});
