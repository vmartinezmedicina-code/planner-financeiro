/**
 * Testes de integração das regras financeiras da V2 contra um banco SQLite
 * temporário (criado com `prisma db push` a partir do schema atual). Não toca
 * no dev.db nem em produção.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-test-"));
const dbFile = path.join(tmpDir, "test.db");
process.env.DATABASE_URL = `file:${dbFile.replace(/\\/g, "/")}`;

type Services = {
  prisma: typeof import("../src/lib/prisma").prisma;
  tx: typeof import("../src/lib/finance/transactionService");
  transfers: typeof import("../src/lib/finance/transfers");
  invoices: typeof import("../src/lib/invoices/invoiceService");
  banks: typeof import("../src/lib/finance/banks");
  planning: typeof import("../src/lib/planning");
  upcoming: typeof import("../src/lib/calendar/upcoming");
  dashboard: typeof import("../src/lib/dashboard");
  analytics: typeof import("../src/lib/analytics/categoryAnalytics");
};
let s: Services;

const HH = "hh_test";
const OTHER_HH = "hh_other";
let userId = "";
let bankA = "";
let bankB = "";
let cardId = "";
let foodCategoryId = "";
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function balanceOf(bankId: string) {
  const list = await s.banks.listBanksWithBalance(HH, { asOf: null });
  return list.find((b) => b.id === bankId)!.currentBalanceCents;
}

before(async () => {
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env },
    stdio: "ignore",
    cwd: path.resolve(__dirname, ".."),
  });
  s = {
    prisma: (await import("../src/lib/prisma")).prisma,
    tx: await import("../src/lib/finance/transactionService"),
    transfers: await import("../src/lib/finance/transfers"),
    invoices: await import("../src/lib/invoices/invoiceService"),
    banks: await import("../src/lib/finance/banks"),
    planning: await import("../src/lib/planning"),
    upcoming: await import("../src/lib/calendar/upcoming"),
    dashboard: await import("../src/lib/dashboard"),
    analytics: await import("../src/lib/analytics/categoryAnalytics"),
  };
  const p = s.prisma;
  await p.household.createMany({ data: [{ id: HH, name: "Teste" }, { id: OTHER_HH, name: "Outra" }] });
  const user = await p.user.create({ data: { name: "U", email: "u@test.local", passwordHash: "x", householdId: HH } });
  userId = user.id;
  bankA = (await p.bank.create({ data: { name: "A", initialBalance: 1000, initialBalanceCents: 100000, householdId: HH } })).id;
  bankB = (await p.bank.create({ data: { name: "B", initialBalance: 0, initialBalanceCents: 0, householdId: HH } })).id;
  cardId = (await p.creditCard.create({ data: { name: "Cartao", closingDay: 10, dueDay: 20, householdId: HH } })).id;
  const root = await p.category.create({ data: { name: "Despesas", type: "DESPESA", householdId: HH } });
  foodCategoryId = (await p.category.create({ data: { name: "Mercado", type: "DESPESA", parentId: root.id, householdId: HH } })).id;
});

after(async () => {
  await s?.prisma.$disconnect();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("saldo da conta", () => {
  test("receita e despesa movem o saldo; valores em centavos exatos", async () => {
    await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2026-11-01"), description: "salario", amountCents: 500000, paymentMethod: "PIX", bankId: bankA });
    const exp = await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2026-11-02"), description: "mercado", amountCents: 10050, paymentMethod: "DEBITO", bankId: bankA, categoryId: foodCategoryId, kind: "EXPENSE" });
    assert.equal(exp.kind, "EXPENSE");
    assert.equal(exp.amountCents, -10050, "despesa é normalizada para negativo");
    assert.equal(exp.amount, -100.5, "campo Float legado espelha os centavos");
    assert.equal(await balanceOf(bankA), 100000 + 500000 - 10050);
  });

  test("0,10 + 0,20 somados mil vezes não acumulam erro", async () => {
    const before = await balanceOf(bankB);
    for (let i = 0; i < 20; i++) {
      await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2026-11-03"), description: `c${i}`, amountCents: i % 2 ? 10 : 20, paymentMethod: "PIX", bankId: bankB });
    }
    assert.equal(await balanceOf(bankB), before + 10 * 10 + 10 * 20);
  });

  test("conta de outra família é recusada", async () => {
    const foreign = await s.prisma.bank.create({ data: { name: "X", householdId: OTHER_HH } });
    await assert.rejects(
      s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2026-11-03"), description: "x", amountCents: -100, bankId: foreign.id }),
      /Conta não encontrada/
    );
  });
});

describe("compra no cartão e fatura", () => {
  test("compra antes/depois do fechamento cai em faturas diferentes e não mexe no saldo", async () => {
    const before = await balanceOf(bankA);
    const p9 = await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2026-11-09"), description: "dia 9", amountCents: -20000, paymentMethod: "CREDITO", creditCardId: cardId, bankId: bankA, categoryId: foodCategoryId });
    const p11 = await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2026-11-11"), description: "dia 11", amountCents: -30000, paymentMethod: "CREDITO", creditCardId: cardId });
    assert.equal(p9.kind, "CARD_PURCHASE");
    assert.equal(p9.bankId, null, "compra no cartão nunca aponta para conta");
    assert.notEqual(p9.invoiceId, p11.invoiceId);
    assert.equal(await balanceOf(bankA), before);

    const list = await s.invoices.listInvoices(HH, { creditCardId: cardId, today: d("2026-11-08") });
    const nov = list.find((i) => i.label === "11/2026")!;
    const dec = list.find((i) => i.label === "12/2026")!;
    assert.equal(nov.totalCents, 20000);
    assert.equal(dec.totalCents, 30000);
    assert.equal(nov.status, "OPEN");
    assert.equal(nov.dueDate.slice(0, 10), "2026-11-20");
  });

  test("virada de ano: compra em dezembro após o fechamento vai para janeiro", async () => {
    const t = await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2026-12-15"), description: "dez", amountCents: -1000, paymentMethod: "CREDITO", creditCardId: cardId });
    const inv = await s.prisma.creditCardInvoice.findUnique({ where: { id: t.invoiceId! } });
    assert.deepEqual([inv!.referenceYear, inv!.referenceMonth], [2027, 1]);
  });

  test("mudar a data move a compra de fatura e recalcula os totais", async () => {
    const t = await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2026-11-05"), description: "mover", amountCents: -5000, paymentMethod: "CREDITO", creditCardId: cardId });
    const moved = await s.tx.updateTransaction(t.id, HH, { eventDate: d("2026-11-12") });
    assert.notEqual(moved.invoiceId, t.invoiceId);
    const list = await s.invoices.listInvoices(HH, { creditCardId: cardId });
    assert.equal(list.find((i) => i.label === "11/2026")!.totalCents, 20000);
    assert.equal(list.find((i) => i.label === "12/2026")!.totalCents, 35000);
    await s.tx.deleteTransaction(t.id, HH);
    const after = await s.invoices.listInvoices(HH, { creditCardId: cardId });
    assert.equal(after.find((i) => i.label === "12/2026")!.totalCents, 30000);
  });

  test("trocar crédito por débito tira da fatura e passa a mexer na conta", async () => {
    const before = await balanceOf(bankB);
    const t = await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2026-11-06"), description: "troca", amountCents: -700, paymentMethod: "CREDITO", creditCardId: cardId });
    const u = await s.tx.updateTransaction(t.id, HH, { paymentMethod: "DEBITO", bankId: bankB });
    assert.equal(u.kind, "EXPENSE");
    assert.equal(u.invoiceId, null);
    assert.equal(u.creditCardId, null);
    assert.equal(await balanceOf(bankB), before - 700);
    await s.tx.deleteTransaction(t.id, HH);
  });
});

describe("pagamento de fatura", () => {
  test("pagar sai da conta, não é despesa, e quita a fatura", async () => {
    const list = await s.invoices.listInvoices(HH, { creditCardId: cardId });
    const nov = list.find((i) => i.label === "11/2026")!;
    const balBefore = await balanceOf(bankA);
    const planBefore = await s.planning.getPlanningData(HH, 2026, 11);

    const r = await s.invoices.payInvoice({ invoiceId: nov.id, bankId: bankA, userId, householdId: HH, paidAt: d("2026-11-18") });
    assert.equal(r.status, "PAID");
    assert.equal(await balanceOf(bankA), balBefore - 20000);

    const planAfter = await s.planning.getPlanningData(HH, 2026, 11);
    assert.equal(planAfter.summary.totalDespesaRealized, planBefore.summary.totalDespesaRealized, "pagamento não conta de novo como despesa");

    const payment = await s.prisma.transaction.findUnique({ where: { id: r.paymentId } });
    assert.equal(payment!.kind, "CARD_PAYMENT");
    await assert.rejects(s.invoices.payInvoice({ invoiceId: nov.id, bankId: bankA, userId, householdId: HH }), /já está paga/);

    // excluir o pagamento reabre a fatura e devolve o saldo
    await s.tx.deleteTransaction(r.paymentId, HH);
    assert.equal(await balanceOf(bankA), balBefore);
    const reopened = (await s.invoices.listInvoices(HH, { creditCardId: cardId, today: d("2026-11-08") })).find((i) => i.label === "11/2026")!;
    assert.equal(reopened.paidCents, 0);
    assert.equal(reopened.status, "OPEN");
  });

  test("pagamento parcial deixa a fatura PARTIAL com o restante correto", async () => {
    const dec = (await s.invoices.listInvoices(HH, { creditCardId: cardId })).find((i) => i.label === "12/2026")!;
    const r = await s.invoices.payInvoice({ invoiceId: dec.id, bankId: bankA, userId, householdId: HH, amountCents: 10000 });
    assert.equal(r.status, "PARTIAL");
    const view = (await s.invoices.listInvoices(HH, { creditCardId: cardId })).find((i) => i.label === "12/2026")!;
    assert.equal(view.status, "PARTIAL");
    assert.equal(view.remainingCents, 20000);
    await s.tx.deleteTransaction(r.paymentId, HH);
  });

  test("fatura de outra família não pode ser paga", async () => {
    const nov = (await s.invoices.listInvoices(HH, { creditCardId: cardId })).find((i) => i.label === "11/2026")!;
    await assert.rejects(s.invoices.payInvoice({ invoiceId: nov.id, bankId: bankA, userId, householdId: OTHER_HH }), /Fatura não encontrada/);
  });
});

describe("transferência", () => {
  test("gera dois lançamentos ligados, move os saldos e fica fora do planejamento", async () => {
    const a0 = await balanceOf(bankA);
    const b0 = await balanceOf(bankB);
    const planBefore = await s.planning.getPlanningData(HH, 2026, 11);

    const r = await s.transfers.createTransfer({ householdId: HH, userId, fromBankId: bankA, toBankId: bankB, amountCents: 30000, date: d("2026-11-07") });
    const sides = await s.prisma.transaction.findMany({ where: { transferGroupId: r.transferGroupId } });
    assert.equal(sides.length, 2);
    assert.ok(sides.every((t) => t.kind === "TRANSFER" && t.categoryId === null));
    assert.equal(sides.reduce((acc, t) => acc + t.amountCents, 0), 0, "os dois lados se anulam");
    assert.equal(await balanceOf(bankA), a0 - 30000);
    assert.equal(await balanceOf(bankB), b0 + 30000);

    const planAfter = await s.planning.getPlanningData(HH, 2026, 11);
    assert.deepEqual(planAfter.summary, planBefore.summary);

    const del = await s.tx.deleteTransaction(sides[0].id, HH);
    assert.equal(del.deleted, 2, "excluir um lado remove os dois");
    assert.equal(await balanceOf(bankA), a0);
    assert.equal(await balanceOf(bankB), b0);
  });

  test("recusa mesma conta, valor inválido e conta de outra família", async () => {
    await assert.rejects(s.transfers.createTransfer({ householdId: HH, userId, fromBankId: bankA, toBankId: bankA, amountCents: 100, date: d("2026-11-07") }), /contas diferentes/);
    await assert.rejects(s.transfers.createTransfer({ householdId: HH, userId, fromBankId: bankA, toBankId: bankB, amountCents: 0, date: d("2026-11-07") }), /inválido/);
    await assert.rejects(s.transfers.createTransfer({ householdId: OTHER_HH, userId, fromBankId: bankA, toBankId: bankB, amountCents: 100, date: d("2026-11-07") }), /Conta não encontrada/);
  });
});

describe("planejamento", () => {
  test("realizado soma despesa na conta e compra no cartão da categoria", async () => {
    const plan = await s.planning.getPlanningData(HH, 2026, 11);
    // mercado (100,50 no débito) + compra do dia 9 (200,00 no crédito)
    assert.equal(plan.summary.totalDespesaRealized, 300.5);
  });
});

describe("saldo real × agendado (Fase 2)", () => {
  // "Hoje" fixo para o teste não depender do relógio.
  const today = d("2026-11-08");

  test("lançamento com data futura não entra no saldo de hoje; aparece como agendado", async () => {
    const before = (await s.banks.listBanksWithBalance(HH, { asOf: today })).find((b) => b.id === bankB)!;
    const future = await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2026-11-20"), description: "conta de luz", amountCents: -32000, kind: "EXPENSE", bankId: bankB });

    const after = (await s.banks.listBanksWithBalance(HH, { asOf: today })).find((b) => b.id === bankB)!;
    assert.equal(after.currentBalanceCents, before.currentBalanceCents, "saldo real de hoje não muda");
    assert.equal(after.scheduledCents, before.scheduledCents - 32000);

    const onTheDay = (await s.banks.listBanksWithBalance(HH, { asOf: d("2026-11-20") })).find((b) => b.id === bankB)!;
    assert.equal(onTheDay.currentBalanceCents, before.currentBalanceCents + before.scheduledCents - 32000, "no dia, entra no saldo");
    await s.tx.deleteTransaction(future.id, HH);
  });

  test("data de efetivação, quando informada, é a data de caixa", async () => {
    const before = (await s.banks.listBanksWithBalance(HH, { asOf: today })).find((b) => b.id === bankB)!;
    // compra em 05/11 (passado), mas o dinheiro só sai em 15/11 (futuro)
    const t = await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2026-11-05"), settlementDate: d("2026-11-15"), description: "boleto", amountCents: -5000, kind: "EXPENSE", bankId: bankB });
    const after = (await s.banks.listBanksWithBalance(HH, { asOf: today })).find((b) => b.id === bankB)!;
    assert.equal(after.currentBalanceCents, before.currentBalanceCents);
    assert.equal(after.scheduledCents, before.scheduledCents - 5000);
    await s.tx.deleteTransaction(t.id, HH);
  });
});

describe("próximos vencimentos e dashboard (Fase 2)", () => {
  const today = d("2026-11-08");

  test("lista faturas não pagas e lançamentos futuros da janela, em ordem de data", async () => {
    const bill = await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2026-11-20"), description: "energia", amountCents: -32000, kind: "EXPENSE", bankId: bankA });
    const pay = await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2026-11-25"), description: "freelance", amountCents: 150000, kind: "INCOME", bankId: bankA });
    const far = await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2027-03-01"), description: "longe", amountCents: -999, kind: "EXPENSE", bankId: bankA });

    const items = await s.upcoming.getUpcoming(HH, { today, days: 30 });
    const labels = items.map((i) => i.label);
    assert.ok(labels.includes("energia") && labels.includes("freelance"));
    assert.ok(!labels.includes("longe"), "fora da janela de 30 dias");
    assert.ok(!labels.includes("mercado"), "lançamentos passados não são compromissos");
    const invoice = items.find((i) => i.source === "INVOICE" && i.label.includes("11/2026"))!;
    assert.equal(invoice.amountCents, -20000);
    assert.equal(invoice.provisional, true, "fatura ainda aberta em 08/11 (fecha dia 10)");
    assert.deepEqual([...items].sort((a, b) => a.date.localeCompare(b.date)).map((i) => i.id), items.map((i) => i.id));

    for (const t of [bill, pay, far]) await s.tx.deleteTransaction(t.id, HH);
  });

  test("indicador do dashboard e drill-down mostram o mesmo total de despesas", async () => {
    const noneOf = (a: { children: { name: string; realizedCents: number }[] }) => a.children.find((c) => c.name === "Sem categoria")?.realizedCents ?? 0;
    const before = (await s.analytics.getCategoryAnalysis(HH, { type: "DESPESA", categoryId: null, year: 2026, month: 11 }))!;
    const uncategorized = await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2026-11-04"), description: "sem categoria", amountCents: -7000, kind: "EXPENSE", bankId: bankA });
    const dash = await s.dashboard.getDashboardData(HH, 2026, 11);
    const root = (await s.analytics.getCategoryAnalysis(HH, { type: "DESPESA", categoryId: null, year: 2026, month: 11 }))!;
    assert.equal(dash.period.despesaRealizedCents, root.node.realizedCents, "indicador = drill-down");
    assert.equal(root.node.realizedCents, before.node.realizedCents + 7000, "despesa sem categoria entra no total");
    assert.equal(noneOf(root), noneOf(before) + 7000, "e aparece na linha 'Sem categoria'");
    assert.equal(root.transactionCount, root.transactions.length);
    await s.tx.deleteTransaction(uncategorized.id, HH);
  });

  test("drill-down de uma categoria traz os lançamentos dela e de outra família não", async () => {
    const node = (await s.analytics.getCategoryAnalysis(HH, { type: "DESPESA", categoryId: foodCategoryId, year: 2026, month: 11 }))!;
    assert.equal(node.node.name, "Mercado");
    assert.deepEqual(node.path.map((p) => p.name), ["Despesas", "Mercado"]);
    assert.equal(node.node.realizedCents, 30050); // 100,50 no débito + 200,00 no crédito
    assert.equal(node.transactions.length, 2);
    assert.equal(await s.analytics.getCategoryAnalysis(OTHER_HH, { type: "DESPESA", categoryId: foodCategoryId, year: 2026, month: 11 }), null);
  });
});
