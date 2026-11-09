-- V2 Fase 1: fundacao. Migration ADITIVA, escrita a mao para evitar o
-- "RedefineTables" do Prisma (recriar/copiar/renomear tabelas), que depende de
-- PRAGMAs e nao e seguro no Turso. So CREATE TABLE / ADD COLUMN / CREATE INDEX.

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "HouseholdMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HouseholdMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreditCardInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT,
    "creditCardId" TEXT NOT NULL,
    "referenceYear" INTEGER NOT NULL,
    "referenceMonth" INTEGER NOT NULL,
    "openingDate" DATETIME NOT NULL,
    "closingDate" DATETIME NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "paidAt" DATETIME,
    "paymentBankId" TEXT,
    "paymentTransactionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreditCardInvoice_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CreditCardInvoice_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreditCardInvoice_paymentBankId_fkey" FOREIGN KEY ("paymentBankId") REFERENCES "Bank" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- User
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "householdId" TEXT CONSTRAINT "User_householdId_fkey" REFERENCES "Household" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Bank
ALTER TABLE "Bank" ADD COLUMN "initialBalanceCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Bank" ADD COLUMN "householdId" TEXT CONSTRAINT "Bank_householdId_fkey" REFERENCES "Household" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreditCard
ALTER TABLE "CreditCard" ADD COLUMN "householdId" TEXT CONSTRAINT "CreditCard_householdId_fkey" REFERENCES "Household" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Category
ALTER TABLE "Category" ADD COLUMN "householdId" TEXT CONSTRAINT "Category_householdId_fkey" REFERENCES "Household" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PlannedValue
ALTER TABLE "PlannedValue" ADD COLUMN "amountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlannedValue" ADD COLUMN "householdId" TEXT CONSTRAINT "PlannedValue_householdId_fkey" REFERENCES "Household" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Transaction
ALTER TABLE "Transaction" ADD COLUMN "amountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'EXPENSE';
ALTER TABLE "Transaction" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Transaction" ADD COLUMN "householdId" TEXT CONSTRAINT "Transaction_householdId_fkey" REFERENCES "Household" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD COLUMN "memberId" TEXT CONSTRAINT "Transaction_memberId_fkey" REFERENCES "HouseholdMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD COLUMN "transferGroupId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "invoiceId" TEXT CONSTRAINT "Transaction_invoiceId_fkey" REFERENCES "CreditCardInvoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- InstallmentPurchase
ALTER TABLE "InstallmentPurchase" ADD COLUMN "totalAmountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InstallmentPurchase" ADD COLUMN "householdId" TEXT CONSTRAINT "InstallmentPurchase_householdId_fkey" REFERENCES "Household" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Investment
ALTER TABLE "Investment" ADD COLUMN "contributedAmountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Investment" ADD COLUMN "currentValueCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Investment" ADD COLUMN "householdId" TEXT CONSTRAINT "Investment_householdId_fkey" REFERENCES "Household" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE UNIQUE INDEX "HouseholdMember_userId_key" ON "HouseholdMember"("userId");
CREATE INDEX "HouseholdMember_householdId_idx" ON "HouseholdMember"("householdId");
CREATE UNIQUE INDEX "CreditCardInvoice_creditCardId_referenceYear_referenceMonth_key" ON "CreditCardInvoice"("creditCardId", "referenceYear", "referenceMonth");
CREATE INDEX "CreditCardInvoice_householdId_idx" ON "CreditCardInvoice"("householdId");
CREATE INDEX "CreditCardInvoice_dueDate_idx" ON "CreditCardInvoice"("dueDate");
CREATE INDEX "Bank_householdId_idx" ON "Bank"("householdId");
CREATE INDEX "CreditCard_householdId_idx" ON "CreditCard"("householdId");
CREATE INDEX "Category_householdId_idx" ON "Category"("householdId");
CREATE INDEX "PlannedValue_householdId_idx" ON "PlannedValue"("householdId");
CREATE INDEX "Transaction_kind_idx" ON "Transaction"("kind");
CREATE INDEX "Transaction_householdId_eventDate_idx" ON "Transaction"("householdId", "eventDate");
CREATE INDEX "Transaction_memberId_idx" ON "Transaction"("memberId");
CREATE INDEX "Transaction_transferGroupId_idx" ON "Transaction"("transferGroupId");
CREATE INDEX "Transaction_invoiceId_idx" ON "Transaction"("invoiceId");
CREATE INDEX "InstallmentPurchase_householdId_idx" ON "InstallmentPurchase"("householdId");
CREATE INDEX "Investment_householdId_idx" ON "Investment"("householdId");
