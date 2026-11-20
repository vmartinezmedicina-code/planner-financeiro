import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { goalProgress, simulateGoal, shareOfFreeFlow, purchaseScenarios, monthsUntil } from "../src/lib/goals/goalCalculator";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const today = d("2026-11-20");

describe("exemplo da especificação: viagem de R$ 30.000", () => {
  const p = goalProgress({ targetCents: 3_000_000, currentCents: 600_000, targetDate: d("2027-07-31"), today });

  test("faltam R$ 24.000, 8 meses, R$ 3.000/mês, 20% atingido", () => {
    assert.equal(p.remainingCents, 2_400_000);
    assert.equal(p.monthsLeft, 8);
    assert.equal(p.monthlyNeededCents, 300_000);
    assert.equal(p.percent, 20);
    assert.equal(p.achieved, false);
    assert.equal(p.overdue, false);
  });

  test("valor semanal aproximado", () => {
    assert.ok(p.weeksLeft! >= 36 && p.weeksLeft! <= 37);
    assert.equal(p.weeklyNeededCents, Math.ceil(2_400_000 / p.weeksLeft!));
  });

  test("impacto: R$ 4.000/mês sobre R$ 5.200 livres ≈ 77%", () => {
    assert.equal(shareOfFreeFlow(400_000, 520_000), 76.9);
    assert.equal(shareOfFreeFlow(300_000, 0), null);
  });
});

describe("simulações (não alteram a meta)", () => {
  const base = { targetCents: 3_000_000, currentCents: 600_000, today };
  test("guardando R$ 2.000/mês: 12 meses", () => {
    const s = simulateGoal({ ...base, monthlyCents: 200_000 });
    assert.equal(s.months, 12);
    assert.equal(s.reachDate!.slice(0, 7), "2027-11");
  });
  test("guardando R$ 4.000/mês: 6 meses", () => {
    assert.equal(simulateGoal({ ...base, monthlyCents: 400_000 }).months, 6);
  });
  test("reduzir para R$ 24.000 com o mesmo prazo de 8 meses", () => {
    assert.equal(simulateGoal({ ...base, targetCents: 2_400_000, months: 8 }).monthlyCents, 225_000);
  });
  test("adiar o prazo (mais meses) reduz o aporte", () => {
    assert.equal(simulateGoal({ ...base, months: 13 }).monthlyCents, Math.ceil(2_400_000 / 13));
  });
  test("aporte zero não tem prazo", () => {
    assert.equal(simulateGoal({ ...base, monthlyCents: 0 }).months, null);
  });
});

describe("casos de borda", () => {
  test("meta atingida", () => {
    const p = goalProgress({ targetCents: 100_000, currentCents: 120_000, targetDate: d("2027-01-01"), today });
    assert.equal(p.achieved, true);
    assert.equal(p.remainingCents, 0);
    assert.equal(p.monthlyNeededCents, 0);
    assert.equal(p.percent, 120);
  });
  test("prazo vencido sem atingir", () => {
    const p = goalProgress({ targetCents: 100_000, currentCents: 10_000, targetDate: d("2026-10-01"), today });
    assert.equal(p.overdue, true);
    assert.equal(p.monthsLeft, 0);
    assert.equal(p.monthlyNeededCents, null);
  });
  test("prazo no mês atual conta como 1 mês", () => {
    assert.equal(monthsUntil(today, d("2026-11-30")), 1);
  });
  test("sem data desejada não há aporte necessário", () => {
    const p = goalProgress({ targetCents: 100_000, currentCents: 0, targetDate: null, today });
    assert.equal(p.monthsLeft, null);
    assert.equal(p.monthlyNeededCents, null);
  });
  test("aporte planejado: quando chega e se cumpre o prazo", () => {
    const ok = goalProgress({ targetCents: 3_000_000, currentCents: 600_000, targetDate: d("2027-07-31"), monthlyPlanCents: 300_000, today });
    assert.equal(ok.plan!.months, 8);
    assert.equal(ok.plan!.onTrack, true);
    const late = goalProgress({ targetCents: 3_000_000, currentCents: 600_000, targetDate: d("2027-07-31"), monthlyPlanCents: 200_000, today });
    assert.equal(late.plan!.months, 12);
    assert.equal(late.plan!.onTrack, false);
  });
});

describe("planejamento de compra: à vista × parcelado", () => {
  test("notebook de R$ 12.000 para março", () => {
    const s = purchaseScenarios({ priceCents: 1_200_000, savedCents: 0, monthsUntilPurchase: monthsUntil(today, d("2027-03-15")), installments: 12, freeFlowCents: 520_000 });
    assert.equal(s.cash.months, 4);
    assert.equal(s.cash.monthlyCents, 300_000);
    assert.equal(s.cash.shareOfFreeFlow, 57.7);
    assert.equal(s.installments.installmentCents, 100_000);
    assert.equal(s.installments.shareOfFreeFlow, 19.2);
  });
});
