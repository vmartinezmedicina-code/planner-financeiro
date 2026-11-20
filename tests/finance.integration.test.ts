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
  recurrence: typeof import("../src/lib/finance/recurrence");
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
    recurrence: await import("../src/lib/finance/recurrence"),
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

describe("status derivado ao gravar", () => {
  test("compra no cartão fica pendente até a fatura ser paga; conta paga se a data já passou", async () => {
    const card = await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2026-11-05"), description: "cartao", amountCents: -1000, paymentMethod: "CREDITO", creditCardId: cardId });
    const past = await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2026-11-01"), description: "passado", amountCents: -1000, kind: "EXPENSE", bankId: bankA });
    const future = await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2099-01-01"), description: "futuro", amountCents: -1000, kind: "EXPENSE", bankId: bankA });
    assert.equal(card.status, "PENDENTE");
    assert.equal(past.status, "PAGO");
    assert.equal(future.status, "PENDENTE");

    const moved = await s.tx.updateTransaction(future.id, HH, { eventDate: d("2026-11-02") });
    assert.equal(moved.status, "PAGO", "mudar para data passada atualiza o status");
    const toCard = await s.tx.updateTransaction(past.id, HH, { paymentMethod: "CREDITO", creditCardId: cardId });
    assert.equal(toCard.status, "PENDENTE", "virar compra no cartão volta a pendente");

    for (const t of [card, past, future]) await s.tx.deleteTransaction(t.id, HH);
  });

  test("compra nova numa fatura já paga reabre o valor em aberto", async () => {
    const t1 = await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2027-02-05"), description: "fev 1", amountCents: -4000, paymentMethod: "CREDITO", creditCardId: cardId });
    const r = await s.invoices.payInvoice({ invoiceId: t1.invoiceId!, bankId: bankA, userId, householdId: HH, paidAt: d("2027-02-20") });
    assert.equal(r.status, "PAID");
    const t2 = await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2027-02-06"), description: "fev 2", amountCents: -1500, paymentMethod: "CREDITO", creditCardId: cardId });
    assert.equal(t2.invoiceId, t1.invoiceId);
    const view = (await s.invoices.listInvoices(HH, { creditCardId: cardId })).find((i) => i.id === t1.invoiceId)!;
    assert.equal(view.status, "PARTIAL");
    assert.equal(view.remainingCents, 1500);
    const r2 = await s.invoices.payInvoice({ invoiceId: t1.invoiceId!, bankId: bankA, userId, householdId: HH, paidAt: d("2027-02-21") });
    assert.equal(r2.status, "PAID", "dá para pagar o restante");
    for (const id of [r2.paymentId, r.paymentId, t2.id, t1.id]) await s.tx.deleteTransaction(id, HH);
  });
});

describe("recorrência mensal", () => {
  const today = d("2026-11-19");
  const seriesTx = (seriesId: string) =>
    s.prisma.transaction.findMany({
      where: { recurringSeriesId: seriesId },
      orderBy: { eventDate: "asc" },
      select: { id: true, eventDate: true, amountCents: true, description: true, invoiceId: true, kind: true },
    });
  const ymd = (x: Date) => x.toISOString().slice(0, 10);

  test("cria 12 meses; no cartão, cada ocorrência cai na fatura do seu mês", async () => {
    const r = await s.recurrence.createRecurringSeries(
      { householdId: HH, userId, eventDate: d("2026-11-19"), description: "Streaming", amountCents: -5590, paymentMethod: "CREDITO", creditCardId: cardId, categoryId: foodCategoryId },
      today
    );
    assert.equal(r.count, 12);
    const occ = await seriesTx(r.seriesId);
    assert.equal(occ.length, 12);
    assert.equal(ymd(occ[0].eventDate), "2026-11-19");
    assert.equal(ymd(occ[11].eventDate), "2027-10-19");
    assert.ok(occ.every((o) => o.kind === "CARD_PURCHASE" && o.amountCents === -5590));
    assert.equal(new Set(occ.map((o) => o.invoiceId)).size, 12, "uma fatura por mês (fecha dia 10, compra dia 19)");
  });

  test("renovação completa os meses que faltam e não duplica se chamada duas vezes ao mesmo tempo", async () => {
    const r = await s.recurrence.createRecurringSeries(
      { householdId: HH, userId, eventDate: d("2026-11-05"), description: "Academia", amountCents: -12000, kind: "EXPENSE", bankId: bankA },
      today
    );
    const later = d("2027-01-10"); // dois meses depois: horizonte vai até dez/2027
    const [a, b] = await Promise.all([s.recurrence.ensureRecurringHorizon(HH, later), s.recurrence.ensureRecurringHorizon(HH, later)]);
    const occ = await seriesTx(r.seriesId);
    assert.equal(occ.length, 14);
    assert.equal(ymd(occ[13].eventDate), "2027-12-05");
    assert.ok(a + b >= 2, "gerou os meses que faltavam");
    assert.equal(new Set(occ.map((o) => ymd(o.eventDate))).size, 14, "sem datas repetidas");
    assert.equal(await s.recurrence.ensureRecurringHorizon(HH, later), 0, "já em dia");
  });

  test("data final: para de gerar e encerra a série", async () => {
    const r = await s.recurrence.createRecurringSeries(
      { householdId: HH, userId, eventDate: d("2026-11-10"), description: "Curso", amountCents: -30000, kind: "EXPENSE", bankId: bankA, endDate: d("2027-01-31") },
      today
    );
    assert.equal(r.count, 3);
    await s.recurrence.ensureRecurringHorizon(HH, d("2027-06-01"));
    assert.equal((await seriesTx(r.seriesId)).length, 3, "não gera depois da data final");
    const series = await s.prisma.recurringSeries.findUnique({ where: { id: r.seriesId } });
    assert.equal(series!.active, false);
  });

  test("editar este e os próximos muda valor e dia só daqui para frente, e o modelo da série", async () => {
    const r = await s.recurrence.createRecurringSeries(
      { householdId: HH, userId, eventDate: d("2026-11-15"), description: "Internet", amountCents: -9990, kind: "EXPENSE", bankId: bankB },
      today
    );
    const occ = await seriesTx(r.seriesId);
    await s.recurrence.updateSeriesFrom(occ[2].id, HH, { amountCents: -11990, eventDate: d("2027-01-20"), description: "Internet fibra" });
    const after = await seriesTx(r.seriesId);
    assert.equal(after[0].amountCents, -9990);
    assert.equal(after[1].amountCents, -9990);
    assert.ok(after.slice(2).every((o) => o.amountCents === -11990 && o.description === "Internet fibra"));
    assert.equal(ymd(after[2].eventDate), "2027-01-20");
    assert.equal(ymd(after[3].eventDate), "2027-02-20", "o dia novo vale para os próximos meses");
    const series = await s.prisma.recurringSeries.findUnique({ where: { id: r.seriesId } });
    assert.equal(series!.amountCents, -11990);
    assert.equal(series!.dayOfMonth, 20);
  });

  test("editar só este não mexe nos outros", async () => {
    const r = await s.recurrence.createRecurringSeries(
      { householdId: HH, userId, eventDate: d("2026-11-12"), description: "Luz", amountCents: -20000, kind: "EXPENSE", bankId: bankA },
      today
    );
    const occ = await seriesTx(r.seriesId);
    await s.tx.updateTransaction(occ[1].id, HH, { amountCents: -26000 });
    const after = await seriesTx(r.seriesId);
    assert.equal(after[1].amountCents, -26000);
    assert.ok(after.filter((_, i) => i !== 1).every((o) => o.amountCents === -20000));
  });

  test("excluir este e os próximos mantém os anteriores e encerra a série", async () => {
    const r = await s.recurrence.createRecurringSeries(
      { householdId: HH, userId, eventDate: d("2026-11-08"), description: "Seguro", amountCents: -15000, kind: "EXPENSE", bankId: bankA },
      today
    );
    const occ = await seriesTx(r.seriesId);
    const res = await s.recurrence.deleteSeriesFrom(occ[3].id, HH);
    assert.equal(res.deleted, 9);
    assert.equal((await seriesTx(r.seriesId)).length, 3);
    await s.recurrence.ensureRecurringHorizon(HH, d("2027-12-01"));
    assert.equal((await seriesTx(r.seriesId)).length, 3, "não volta a gerar");
    const series = await s.prisma.recurringSeries.findUnique({ where: { id: r.seriesId } });
    assert.equal(series!.active, false);
  });

  test("transformar um lançamento existente em recorrente", async () => {
    const t = await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2026-11-03"), description: "Plano de saúde", amountCents: -80000, kind: "EXPENSE", bankId: bankA });
    const r = await s.recurrence.convertToSeries(t.id, HH, null, today);
    assert.equal(r.count, 11, "os 11 meses seguintes");
    const occ = await seriesTx(r.seriesId);
    assert.equal(occ.length, 12);
    assert.equal(occ[0].id, t.id);
  });

  test("não aceita ajuste nem lançamento de outra família", async () => {
    await assert.rejects(
      s.recurrence.createRecurringSeries({ householdId: HH, userId, eventDate: d("2026-11-03"), description: "x", amountCents: -1, kind: "ADJUSTMENT", bankId: bankA }, today),
      /podem ser recorrentes/
    );
    const t = await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2026-11-03"), description: "y", amountCents: -100, kind: "EXPENSE", bankId: bankA });
    await assert.rejects(s.recurrence.convertToSeries(t.id, OTHER_HH, null, today), /não encontrado/);
    await s.tx.deleteTransaction(t.id, HH);
  });
});

describe("recorrência no cartão: edição e exclusão em lote", () => {
  const today = d("2026-11-19");
  const invoiceTotals = async (seriesId: string) => {
    const occ = await s.prisma.transaction.findMany({ where: { recurringSeriesId: seriesId }, select: { invoiceId: true } });
    const ids = [...new Set(occ.map((o) => o.invoiceId!))];
    const invs = await s.prisma.creditCardInvoice.findMany({ where: { id: { in: ids } }, select: { id: true, totalCents: true } });
    return { ids, invs };
  };

  test("mudar só o valor de este e os próximos recalcula as faturas dos meses afetados", async () => {
    const card2 = await s.prisma.creditCard.create({ data: { name: "Cartão recorrência", closingDay: 5, dueDay: 15, householdId: HH } });
    const r = await s.recurrence.createRecurringSeries(
      { householdId: HH, userId, eventDate: d("2026-11-20"), description: "Spotify", amountCents: -2190, paymentMethod: "CREDITO", creditCardId: card2.id },
      today
    );
    const occ = await s.prisma.transaction.findMany({ where: { recurringSeriesId: r.seriesId }, orderBy: { eventDate: "asc" } });
    // o formulário manda todos os campos, inclusive os que não mudaram
    await s.recurrence.updateSeriesFrom(occ[4].id, HH, {
      eventDate: occ[4].eventDate, paymentMethod: "CREDITO", creditCardId: card2.id, bankId: null,
      description: "Spotify Família", amountCents: 3490, categoryId: null, memberId: null,
    });
    const after = await s.prisma.transaction.findMany({ where: { recurringSeriesId: r.seriesId }, orderBy: { eventDate: "asc" } });
    assert.ok(after.slice(0, 4).every((o) => o.amountCents === -2190 && o.description === "Spotify"));
    assert.ok(after.slice(4).every((o) => o.amountCents === -3490 && o.amount === -34.9 && o.description === "Spotify Família"), "sinal normalizado e Float espelhado");
    const { invs } = await invoiceTotals(r.seriesId);
    const total = invs.reduce((acc, i) => acc + i.totalCents, 0);
    assert.equal(total, 4 * 2190 + 8 * 3490, "faturas refletem os novos valores");
    const series = await s.prisma.recurringSeries.findUnique({ where: { id: r.seriesId } });
    assert.equal(series!.amountCents, -3490);
    assert.equal(series!.description, "Spotify Família");

    const del = await s.recurrence.deleteSeriesFrom(after[0].id, HH);
    assert.equal(del.deleted, 12);
    const { invs: emptied } = await invoiceTotals(r.seriesId);
    assert.equal(emptied.length, 0, "nenhuma ocorrência sobrou");
    const invAfter = await s.prisma.creditCardInvoice.findMany({ where: { creditCardId: card2.id } });
    assert.ok(invAfter.every((i) => i.totalCents === 0), "faturas zeradas após a exclusão");
    assert.equal(await s.prisma.recurringSeries.findUnique({ where: { id: r.seriesId } }), null, "série sem ocorrências é removida");
  });
});
