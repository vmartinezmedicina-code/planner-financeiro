import "dotenv/config";
import { prisma } from "../src/lib/prisma";

// Conferência da migração V2. SOMENTE LEITURA: não altera nada. Mostra apenas
// contagens e somas (nenhuma descrição ou dado pessoal). Usa a DATABASE_URL do
// ambiente (local ou Turso com TURSO_AUTH_TOKEN).

const n = (v: unknown) => (typeof v === "bigint" ? Number(v) : Number(v ?? 0));

async function raw(sql: string): Promise<Record<string, unknown>[]> {
  return prisma.$queryRawUnsafe(sql);
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  console.log(`Banco: ${url.startsWith("libsql:") ? "Turso (" + url.replace(/^libsql:\/\//, "").split(".")[0] + ")" : "local (" + url + ")"}\n`);

  // --- Lançamentos: SQL direto e Prisma lado a lado (devem bater) ---
  const total = n((await raw(`SELECT COUNT(*) c FROM "Transaction"`))[0].c);
  const totalPrisma = await prisma.transaction.count();
  console.log(`Lançamentos: ${total} (via Prisma: ${totalPrisma})`);

  const byKind = await raw(`SELECT kind, COUNT(*) c, SUM(amountCents) cents FROM "Transaction" GROUP BY kind ORDER BY kind`);
  for (const r of byKind) console.log(`  ${String(r.kind).padEnd(14)} ${String(n(r.c)).padStart(5)}  soma ${(n(r.cents) / 100).toFixed(2)}`);

  const withCard = n((await raw(`SELECT COUNT(*) c FROM "Transaction" WHERE creditCardId IS NOT NULL`))[0].c);
  const cardPurchases = n((await raw(`SELECT COUNT(*) c FROM "Transaction" WHERE kind = 'CARD_PURCHASE'`))[0].c);
  const noInvoice = n((await raw(`SELECT COUNT(*) c FROM "Transaction" WHERE kind = 'CARD_PURCHASE' AND invoiceId IS NULL`))[0].c);
  const noInvoicePrisma = await prisma.transaction.count({ where: { kind: "CARD_PURCHASE", invoiceId: null } });
  const byPayment = await raw(`SELECT paymentMethod pm, COUNT(*) c FROM "Transaction" GROUP BY paymentMethod`);
  const orphanCard = n((await raw(`SELECT COUNT(*) c FROM "Transaction" t WHERE t.creditCardId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "CreditCard" c WHERE c.id = t.creditCardId)`))[0].c);
  const creditNoCard = n((await raw(`SELECT COUNT(*) c FROM "Transaction" WHERE paymentMethod = 'CREDITO' AND creditCardId IS NULL`))[0].c);
  console.log(`\nCartão:`);
  console.log(`  com cartão vinculado: ${withCard}`);
  console.log(`  tipo compra no cartão: ${cardPurchases}`);
  console.log(`  compras sem fatura: ${noInvoice} (via Prisma: ${noInvoicePrisma})`);
  console.log(`  forma de pagamento: ${byPayment.map((r) => `${r.pm}=${n(r.c)}`).join(", ") || "-"}`);
  console.log(`  crédito sem cartão vinculado: ${creditNoCard}`);
  console.log(`  cartão vinculado que não existe mais: ${orphanCard}`);

  const cards = await raw(`SELECT COUNT(*) c, SUM(CASE WHEN closingDay IS NULL THEN 1 ELSE 0 END) semFechamento FROM "CreditCard"`);
  const invoices = n((await raw(`SELECT COUNT(*) c FROM "CreditCardInvoice"`))[0].c);
  const banks = n((await raw(`SELECT COUNT(*) c FROM "Bank"`))[0].c);
  console.log(`\nCadastros: ${banks} conta(s), ${n(cards[0].c)} cartão(ões) (${n(cards[0].semFechamento)} sem dia de fechamento), ${invoices} fatura(s)`);

  // --- Centavos x Float ---
  const checks: [string, string][] = [
    ["Transaction.amount", `SELECT COUNT(*) c FROM "Transaction" WHERE amountCents <> CAST(ROUND(amount * 100) AS INTEGER)`],
    ["Bank.initialBalance", `SELECT COUNT(*) c FROM "Bank" WHERE initialBalanceCents <> CAST(ROUND(initialBalance * 100) AS INTEGER)`],
    ["PlannedValue.amount", `SELECT COUNT(*) c FROM "PlannedValue" WHERE amountCents <> CAST(ROUND(amount * 100) AS INTEGER)`],
    ["InstallmentPurchase.totalAmount", `SELECT COUNT(*) c FROM "InstallmentPurchase" WHERE totalAmountCents <> CAST(ROUND(totalAmount * 100) AS INTEGER)`],
    ["Investment.contributedAmount", `SELECT COUNT(*) c FROM "Investment" WHERE contributedAmountCents <> CAST(ROUND(contributedAmount * 100) AS INTEGER)`],
    ["Investment.currentValue", `SELECT COUNT(*) c FROM "Investment" WHERE currentValueCents <> CAST(ROUND(currentValue * 100) AS INTEGER)`],
  ];
  console.log(`\nCentavos diferentes do valor antigo (esperado 0 em todos):`);
  let problems = 0;
  for (const [label, sql] of checks) {
    const c = n((await raw(sql))[0].c);
    problems += c;
    console.log(`  ${label}: ${c}`);
  }

  // --- Família ---
  const hh = n((await raw(`SELECT COUNT(*) c FROM "Household"`))[0].c);
  const members = n((await raw(`SELECT COUNT(*) c FROM "HouseholdMember"`))[0].c);
  console.log(`\nFamília: ${hh} família(s), ${members} membro(s)`);
  console.log(`Registros sem família (esperado 0 em todos):`);
  for (const t of ["User", "Bank", "CreditCard", "Category", "PlannedValue", "Transaction", "InstallmentPurchase", "Investment"]) {
    const c = n((await raw(`SELECT COUNT(*) c FROM "${t}" WHERE householdId IS NULL`))[0].c);
    problems += c;
    console.log(`  ${t}: ${c}`);
  }

  const hasTable = (await raw(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_deploy_migrations'`)).length > 0;
  const applied = hasTable ? await raw(`SELECT name FROM _deploy_migrations ORDER BY name`) : [];
  if (applied.length) console.log(`\nMigrations registradas: ${applied.length} (última: ${applied[applied.length - 1].name})`);

  console.log(problems === 0 && noInvoice === 0 ? "\nResultado: tudo consistente." : `\nResultado: ${problems} divergência(s); ${noInvoice} compra(s) de cartão sem fatura.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
