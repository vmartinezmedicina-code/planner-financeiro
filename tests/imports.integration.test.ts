/**
 * Integração da importação (conferência → lançamentos → desfazer) contra um
 * SQLite temporário criado a partir do schema atual. Não toca no dev.db.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-import-test-"));
const dbFile = path.join(tmpDir, "test.db");
process.env.DATABASE_URL = `file:${dbFile.replace(/\\/g, "/")}`;

type Services = {
  prisma: typeof import("../src/lib/prisma").prisma;
  tx: typeof import("../src/lib/finance/transactionService");
  imports: typeof import("../src/lib/imports/importService");
};
let s: Services;

const HH = "hh_imp";
const OTHER_HH = "hh_imp_other";
let userId = "";
let bankId = "";
let cardId = "";
let foodCategoryId = "";
let salaryCategoryId = "";
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type Line = Parameters<Services["imports"]["addLines"]>[3][number];
const lines = (): Line[] => [
  { date: d("2026-10-20"), original: "IFD*IFOOD CLUB", name: "iFood", amountCents: -4590, kindHint: "PURCHASE", installment: null, aiCategoryId: null },
  { date: d("2026-08-20"), original: "LOJA X PARC 03/05", name: "Loja X", amountCents: -10000, kindHint: "PURCHASE", installment: { number: 3, total: 5 }, aiCategoryId: null },
  { date: d("2026-10-25"), original: "ESTORNO LOJA Y", name: "Loja Y", amountCents: 1000, kindHint: "REFUND", installment: null, aiCategoryId: null },
  { date: d("2026-10-28"), original: "PAGAMENTO RECEBIDO", name: "Pagamento", amountCents: 50000, kindHint: "BILL_PAYMENT", installment: null, aiCategoryId: null },
];

before(async () => {
  execSync("npx prisma db push --skip-generate --accept-data-loss", { env: { ...process.env }, stdio: "ignore", cwd: path.resolve(__dirname, "..") });
  s = {
    prisma: (await import("../src/lib/prisma")).prisma,
    tx: await import("../src/lib/finance/transactionService"),
    imports: await import("../src/lib/imports/importService"),
  };
  const p = s.prisma;
  await p.household.createMany({ data: [{ id: HH, name: "Teste" }, { id: OTHER_HH, name: "Outra" }] });
  userId = (await p.user.create({ data: { name: "U", email: "imp@test.local", passwordHash: "x", householdId: HH } })).id;
  bankId = (await p.bank.create({ data: { name: "Conta", householdId: HH } })).id;
  cardId = (await p.creditCard.create({ data: { name: "Cartao", closingDay: 5, dueDay: 12, householdId: HH } })).id;
  const root = await p.category.create({ data: { name: "Despesas", type: "DESPESA", householdId: HH } });
  foodCategoryId = (await p.category.create({ data: { name: "Mercado", type: "DESPESA", parentId: root.id, householdId: HH } })).id;
  salaryCategoryId = (await p.category.create({ data: { name: "Receitas", type: "RECEITA", householdId: HH } })).id;
});

after(async () => {
  await s?.prisma.$disconnect();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("importação de fatura", () => {
  let sessionId = "";

  test("fatura escolhida: à vista, parcelas futuras, estorno; pagamento fica de fora", async () => {
    const imp = await s.imports.createImportSession({ householdId: HH, userId, target: "CARD", creditCardId: cardId, invoiceRef: { year: 2026, month: 11 } });
    sessionId = imp.id;
    const withCat = lines();
    withCat[1].aiCategoryId = foodCategoryId;
    await s.imports.addLines(sessionId, HH, { name: "fatura.pdf", index: 0 }, withCat, { statementTotalCents: 13590 });
    const view = await s.imports.getImportView(sessionId, HH);
    assert.equal(view.items.length, 4);
    const pay = view.items.find((i) => i.kindHint === "BILL_PAYMENT")!;
    assert.equal(pay.include, false);
    assert.equal(pay.locked, true);
    assert.equal(view.items.find((i) => i.installmentNumber === 3)!.categoryId, foodCategoryId, "categoria sugerida pela IA aceita");
    assert.equal(view.totals.included, 3);
    assert.equal(view.totals.netCents, -13590);
    assert.equal(view.totals.futureParcels, 2);
    assert.equal(view.statementTotalCents, 13590);

    const r = await s.imports.commitImport(sessionId, HH, userId);
    assert.deepEqual(r, { created: 3, remaining: 0 });
    const txs = await s.prisma.transaction.findMany({ where: { importSessionId: sessionId }, orderBy: { eventDate: "asc" } });
    assert.equal(txs.length, 5, "à vista + parcelas 3, 4, 5 + estorno");
    const inv = async (y: number, m: number) =>
      (await s.prisma.creditCardInvoice.findFirst({ where: { creditCardId: cardId, referenceYear: y, referenceMonth: m } }))?.totalCents;
    assert.equal(await inv(2026, 11), 13590, "4.590 + 10.000 − 1.000");
    assert.equal(await inv(2026, 12), 10000);
    assert.equal(await inv(2027, 1), 10000);
    const refund = txs.find((t) => t.description === "Loja Y")!;
    assert.equal(refund.amountCents, 1000, "estorno fica positivo");
    assert.equal(refund.kind, "CARD_PURCHASE");
    assert.deepEqual(
      txs.filter((t) => t.installmentPurchaseId).map((t) => t.description),
      ["Loja X (3/5)", "Loja X (4/5)", "Loja X (5/5)"]
    );
    assert.equal((await s.imports.getImportView(sessionId, HH)).status, "COMPLETED");
    await assert.rejects(s.imports.commitImport(sessionId, HH, userId), /já foi confirmada/);
  });

  test("reimportar o mesmo documento: tudo marcado como já lançado", async () => {
    const again = await s.imports.createImportSession({ householdId: HH, userId, target: "CARD", creditCardId: cardId, invoiceRef: { year: 2026, month: 11 } });
    await s.imports.addLines(again.id, HH, { name: "fatura.pdf", index: 0 }, lines());
    const view = await s.imports.getImportView(again.id, HH);
    const consumo = view.items.filter((i) => i.kindHint !== "BILL_PAYMENT");
    assert.ok(consumo.every((i) => i.duplicateStatus === "LIKELY" && !i.include), JSON.stringify(consumo.map((i) => i.duplicateStatus)));

    // Fatura de dezembro trazendo a parcela 4/5 (com a data original) também é reconhecida.
    const decImp = await s.imports.createImportSession({ householdId: HH, userId, target: "CARD", creditCardId: cardId, invoiceRef: { year: 2026, month: 12 } });
    await s.imports.addLines(decImp.id, HH, { name: "dez.pdf", index: 0 }, [
      { date: d("2026-08-20"), original: "LOJA X PARC 04/05", name: "Loja X", amountCents: -10000, kindHint: "PURCHASE", installment: { number: 4, total: 5 }, aiCategoryId: null },
    ]);
    assert.equal((await s.imports.getImportView(decImp.id, HH)).items[0].duplicateStatus, "LIKELY");
    await s.imports.discardImport(again.id, HH);
    await s.imports.discardImport(decImp.id, HH);
  });

  test("repetidos entre prints são marcados", async () => {
    const imp = await s.imports.createImportSession({ householdId: HH, userId, target: "CARD", creditCardId: cardId });
    const one: Line = { date: d("2026-11-15"), original: "PADARIA BOM PAO", name: "Padaria", amountCents: -1234, kindHint: "PURCHASE", installment: null, aiCategoryId: null };
    await s.imports.addLines(imp.id, HH, { name: "p1.jpg", index: 0 }, [one]);
    await s.imports.addLines(imp.id, HH, { name: "p2.jpg", index: 1 }, [one]);
    assert.equal(await s.imports.markRepeated(imp.id, HH), 1);
    const view = await s.imports.getImportView(imp.id, HH);
    assert.deepEqual(
      view.items.map((i) => [i.fileName, i.duplicateStatus, i.include]),
      [
        ["p1.jpg", "NEW", true],
        ["p2.jpg", "REPEATED", false],
      ]
    );
    await s.imports.discardImport(imp.id, HH);
  });

  test("editar na conferência: categoria, valor e incluir pagamento de fatura (bloqueado)", async () => {
    const imp = await s.imports.createImportSession({ householdId: HH, userId, target: "CARD", creditCardId: cardId });
    await s.imports.addLines(imp.id, HH, { name: "x.pdf", index: 0 }, [lines()[0], lines()[3]]);
    const [a, pay] = (await s.imports.getImportView(imp.id, HH)).items;
    await s.imports.updateImport(imp.id, HH, {
      items: [
        { id: a.id, categoryId: foodCategoryId, amountCents: -5000, description: "  iFood jantar " },
        { id: pay.id, include: true },
      ],
    });
    const after = (await s.imports.getImportView(imp.id, HH)).items;
    assert.deepEqual([after[0].categoryId, after[0].categorySource, after[0].amountCents, after[0].description], [foodCategoryId, "USER", -5000, "iFood jantar"]);
    assert.equal(after[1].include, false, "pagamento de fatura não entra pela importação");
    const foreignCat = await s.prisma.category.create({ data: { name: "X", type: "DESPESA", householdId: OTHER_HH } });
    await assert.rejects(s.imports.updateImport(imp.id, HH, { items: [{ id: a.id, categoryId: foreignCat.id }] }), /Categoria inválida/);
    await s.imports.discardImport(imp.id, HH);
  });

  test("desfazer remove lançamentos, parcelas e zera as faturas", async () => {
    await assert.rejects(s.imports.discardImport(sessionId, HH), /Desfaça/);
    const r = await s.imports.undoImport(sessionId, HH);
    assert.equal(r.deleted, 5);
    assert.equal(await s.prisma.transaction.count({ where: { creditCardId: cardId } }), 0);
    assert.equal(await s.prisma.installmentPurchase.count({ where: { creditCardId: cardId } }), 0);
    const invs = await s.prisma.creditCardInvoice.findMany({ where: { creditCardId: cardId } });
    assert.ok(invs.every((i) => i.totalCents === 0));
    const view = await s.imports.getImportView(sessionId, HH);
    assert.equal(view.status, "REVIEW");
    assert.ok(view.items.every((i) => i.transactionId === null));
  });
});

describe("importação de extrato", () => {
  test("categoria pelo histórico, receita/despesa na conta e escopo da família", async () => {
    await s.tx.createTransaction({ householdId: HH, userId, eventDate: d("2026-09-01"), description: "Padaria Bom Pão", amountCents: -800, bankId, categoryId: foodCategoryId });
    const imp = await s.imports.createImportSession({ householdId: HH, userId, target: "BANK", bankId });
    await s.imports.addLines(imp.id, HH, { name: "extrato.csv", index: 0 }, [
      { date: d("2026-11-02"), original: "COMPRA DEBITO PADARIA BOM PAO", name: "Padaria Bom Pão", amountCents: -1500, kindHint: "EXPENSE", installment: null, aiCategoryId: null },
      { date: d("2026-11-03"), original: "PIX RECEBIDO FULANO", name: "Fulano", amountCents: 20000, kindHint: "INCOME", installment: null, aiCategoryId: foodCategoryId },
      { date: d("2026-11-04"), original: "SALARIO", name: "Salário", amountCents: 500000, kindHint: "INCOME", installment: null, aiCategoryId: salaryCategoryId },
    ]);
    const view = await s.imports.getImportView(imp.id, HH);
    assert.equal(view.items[0].categoryId, foodCategoryId);
    assert.equal(view.items[0].categorySource, "HISTORY");
    assert.equal(view.items[1].categoryId, null, "categoria de despesa não serve para receita");
    assert.equal(view.items[2].categoryId, salaryCategoryId);
    await assert.rejects(s.imports.getImportView(imp.id, OTHER_HH), /não encontrada/);

    await s.imports.commitImport(imp.id, HH, userId);
    const txs = await s.prisma.transaction.findMany({ where: { importSessionId: imp.id }, orderBy: { eventDate: "asc" } });
    assert.deepEqual(
      txs.map((t) => [t.kind, t.amountCents, t.bankId, t.paymentMethod, t.source]),
      [
        ["EXPENSE", -1500, bankId, "DEBITO", "CSV"],
        ["INCOME", 20000, bankId, "PIX", "CSV"],
        ["INCOME", 500000, bankId, "DEBITO", "CSV"],
      ]
    );
    await s.imports.undoImport(imp.id, HH);
    assert.equal(await s.prisma.transaction.count({ where: { importSessionId: imp.id } }), 0);
  });

  test("conta de outra família é recusada", async () => {
    const foreign = await s.prisma.bank.create({ data: { name: "X", householdId: OTHER_HH } });
    await assert.rejects(s.imports.createImportSession({ householdId: HH, userId, target: "BANK", bankId: foreign.id }), /Escolha a conta/);
  });
});
