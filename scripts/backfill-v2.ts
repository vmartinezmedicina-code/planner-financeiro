import "dotenv/config";
import { TransactionKind } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { ensureInvoiceForPurchase, recalcInvoiceTotal } from "../src/lib/invoices/invoiceService";
import { ensureDefaultHousehold } from "../src/lib/household/householdService";

// Backfill da V2 que precisa de lógica (fora do SQL): atribui uma fatura a cada
// compra no cartão que ainda não tem, e recalcula os totais. Idempotente —
// pode rodar quantas vezes for preciso. Usa a DATABASE_URL do ambiente
// (local ou Turso, com TURSO_AUTH_TOKEN).

async function main() {
  const householdId = await ensureDefaultHousehold();

  // Garantias mínimas para registros criados antes da V2 (caso o SQL não tenha rodado).
  await prisma.user.updateMany({ where: { householdId: null }, data: { householdId } });
  for (const model of ["bank", "creditCard", "category", "plannedValue", "transaction", "installmentPurchase", "investment"] as const) {
    // @ts-expect-error — acesso dinâmico aos delegates com a mesma assinatura de updateMany
    const r = await prisma[model].updateMany({ where: { householdId: null }, data: { householdId } });
    if (r.count) console.log(`${model}: ${r.count} registro(s) ligados à família.`);
  }

  // Registros criados pelo código ANTIGO no intervalo entre a migration e a
  // publicação do código novo nascem com centavos zerados e tipo padrão.
  // Mesmas regras do SQL de backfill; só tocam linhas que a V2 nunca gravou.
  const fixes = [
    `UPDATE "Transaction" SET "amountCents" = CAST(ROUND("amount" * 100) AS INTEGER) WHERE "amountCents" = 0 AND "amount" <> 0`,
    `UPDATE "Transaction" SET "kind" = 'CARD_PURCHASE' WHERE "kind" = 'EXPENSE' AND "creditCardId" IS NOT NULL AND "transferGroupId" IS NULL`,
    `UPDATE "Transaction" SET "kind" = 'INCOME' WHERE "kind" = 'EXPENSE' AND "creditCardId" IS NULL AND "amount" > 0 AND "transferGroupId" IS NULL`,
    `UPDATE "Bank" SET "initialBalanceCents" = CAST(ROUND("initialBalance" * 100) AS INTEGER) WHERE "initialBalanceCents" = 0 AND "initialBalance" <> 0`,
    `UPDATE "PlannedValue" SET "amountCents" = CAST(ROUND("amount" * 100) AS INTEGER) WHERE "amountCents" = 0 AND "amount" <> 0`,
    `UPDATE "InstallmentPurchase" SET "totalAmountCents" = CAST(ROUND("totalAmount" * 100) AS INTEGER) WHERE "totalAmountCents" = 0 AND "totalAmount" <> 0`,
    `UPDATE "Investment" SET "contributedAmountCents" = CAST(ROUND("contributedAmount" * 100) AS INTEGER) WHERE "contributedAmountCents" = 0 AND "contributedAmount" <> 0`,
    `UPDATE "Investment" SET "currentValueCents" = CAST(ROUND("currentValue" * 100) AS INTEGER) WHERE "currentValueCents" = 0 AND "currentValue" <> 0`,
  ];
  let fixed = 0;
  for (const sql of fixes) fixed += await prisma.$executeRawUnsafe(sql);
  if (fixed) console.log(`${fixed} registro(s) do código antigo convertidos (centavos/tipo).`);

  const users = await prisma.user.findMany({ include: { member: true } });
  for (const u of users) {
    if (!u.member) {
      await prisma.householdMember.create({ data: { id: `mem_${u.id}`, householdId, name: u.name, userId: u.id, color: u.avatarColor } });
      console.log(`Membro criado para ${u.name}.`);
    }
  }

  const cards = await prisma.creditCard.findMany({ select: { id: true, name: true, closingDay: true, dueDay: true, householdId: true } });
  let assigned = 0;
  for (const card of cards) {
    const purchases = await prisma.transaction.findMany({
      where: { creditCardId: card.id, kind: TransactionKind.CARD_PURCHASE, invoiceId: null },
      select: { id: true, eventDate: true },
    });
    for (const p of purchases) {
      const invoiceId = await ensureInvoiceForPurchase(prisma, card, p.eventDate);
      await prisma.transaction.update({ where: { id: p.id }, data: { invoiceId } });
      assigned++;
    }
    if (purchases.length) console.log(`${card.name}: ${purchases.length} compra(s) atribuída(s) a faturas.`);
  }

  const invoices = await prisma.creditCardInvoice.findMany({ select: { id: true } });
  for (const inv of invoices) await recalcInvoiceTotal(prisma, inv.id);

  console.log(`Backfill concluído: ${assigned} compra(s) ligadas; ${invoices.length} fatura(s) com total recalculado.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
