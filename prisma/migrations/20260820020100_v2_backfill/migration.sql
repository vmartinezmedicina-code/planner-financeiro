-- V2 Fase 1: backfill de dados. Todas as instrucoes sao idempotentes
-- (podem rodar mais de uma vez sem duplicar nem sobrescrever edicoes novas).
-- Datas: Prisma grava DateTime no SQLite como inteiro (ms Unix), por isso
-- strftime * 1000 e nao CURRENT_TIMESTAMP.

-- Familia padrao (unica, por enquanto)
INSERT INTO "Household" ("id", "name", "createdAt")
SELECT 'hh_default', 'Familia', CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Household" WHERE "id" = 'hh_default');

UPDATE "User" SET "householdId" = 'hh_default' WHERE "householdId" IS NULL;

-- Um membro financeiro por usuario com login
INSERT INTO "HouseholdMember" ("id", "householdId", "name", "userId", "color", "order", "isActive", "createdAt")
SELECT 'mem_' || u."id", 'hh_default', u."name", u."id", u."avatarColor", 0, 1, CAST(strftime('%s','now') AS INTEGER) * 1000
FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "HouseholdMember" m WHERE m."userId" = u."id");

-- Escopo de familia em todos os registros financeiros
UPDATE "Bank" SET "householdId" = 'hh_default' WHERE "householdId" IS NULL;
UPDATE "CreditCard" SET "householdId" = 'hh_default' WHERE "householdId" IS NULL;
UPDATE "Category" SET "householdId" = 'hh_default' WHERE "householdId" IS NULL;
UPDATE "PlannedValue" SET "householdId" = 'hh_default' WHERE "householdId" IS NULL;
UPDATE "Transaction" SET "householdId" = 'hh_default' WHERE "householdId" IS NULL;
UPDATE "InstallmentPurchase" SET "householdId" = 'hh_default' WHERE "householdId" IS NULL;
UPDATE "Investment" SET "householdId" = 'hh_default' WHERE "householdId" IS NULL;

-- Centavos a partir dos Float legados (so onde ainda esta zerado e o Float nao e zero)
UPDATE "Bank" SET "initialBalanceCents" = CAST(ROUND("initialBalance" * 100) AS INTEGER) WHERE "initialBalanceCents" = 0 AND "initialBalance" <> 0;
UPDATE "PlannedValue" SET "amountCents" = CAST(ROUND("amount" * 100) AS INTEGER) WHERE "amountCents" = 0 AND "amount" <> 0;
UPDATE "Transaction" SET "amountCents" = CAST(ROUND("amount" * 100) AS INTEGER) WHERE "amountCents" = 0 AND "amount" <> 0;
UPDATE "InstallmentPurchase" SET "totalAmountCents" = CAST(ROUND("totalAmount" * 100) AS INTEGER) WHERE "totalAmountCents" = 0 AND "totalAmount" <> 0;
UPDATE "Investment" SET "contributedAmountCents" = CAST(ROUND("contributedAmount" * 100) AS INTEGER) WHERE "contributedAmountCents" = 0 AND "contributedAmount" <> 0;
UPDATE "Investment" SET "currentValueCents" = CAST(ROUND("currentValue" * 100) AS INTEGER) WHERE "currentValueCents" = 0 AND "currentValue" <> 0;

-- Tipo do lancamento (regra V1 -> V2): cartao = compra no cartao; valor >= 0 = receita; senao despesa.
-- So altera linhas que ainda tem o default 'EXPENSE' e sem transferGroupId (nunca tocadas pela V2).
UPDATE "Transaction" SET "kind" = 'CARD_PURCHASE' WHERE "kind" = 'EXPENSE' AND "creditCardId" IS NOT NULL AND "transferGroupId" IS NULL;
UPDATE "Transaction" SET "kind" = 'INCOME' WHERE "kind" = 'EXPENSE' AND "creditCardId" IS NULL AND "amount" >= 0 AND "transferGroupId" IS NULL;

-- Quem lancou passa a ser tambem o membro padrao (so onde nao foi informado)
UPDATE "Transaction" SET "memberId" = 'mem_' || "userId" WHERE "memberId" IS NULL AND EXISTS (SELECT 1 FROM "HouseholdMember" m WHERE m."id" = 'mem_' || "Transaction"."userId");
