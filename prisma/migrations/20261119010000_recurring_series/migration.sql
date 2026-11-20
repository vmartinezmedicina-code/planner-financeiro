-- Recorrencia mensal (serie + ocorrencias). Migration ADITIVA, escrita a mao:
-- so CREATE TABLE / ADD COLUMN / CREATE INDEX (sem recriar tabelas).

-- CreateTable
CREATE TABLE "RecurringSeries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "bankId" TEXT,
    "creditCardId" TEXT,
    "categoryId" TEXT,
    "memberId" TEXT,
    "dayOfMonth" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "generatedThrough" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecurringSeries_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecurringSeries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecurringSeries_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RecurringSeries_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RecurringSeries_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RecurringSeries_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Transaction
ALTER TABLE "Transaction" ADD COLUMN "recurringSeriesId" TEXT CONSTRAINT "Transaction_recurringSeriesId_fkey" REFERENCES "RecurringSeries" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "RecurringSeries_householdId_active_idx" ON "RecurringSeries"("householdId", "active");
CREATE INDEX "Transaction_recurringSeriesId_idx" ON "Transaction"("recurringSeriesId");
