-- Importacao com area de conferencia (Fase 6). Migration ADITIVA, escrita a mao:
-- so CREATE TABLE / ADD COLUMN / CREATE INDEX (sem recriar tabelas).

-- CreateTable
CREATE TABLE "ImportSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REVIEW',
    "creditCardId" TEXT,
    "bankId" TEXT,
    "memberId" TEXT,
    "invoiceYear" INTEGER,
    "invoiceMonth" INTEGER,
    "createFutureParcels" BOOLEAN NOT NULL DEFAULT true,
    "detectedInstitution" TEXT,
    "statementTotalCents" INTEGER,
    "warnings" TEXT,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImportSession_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImportSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "fileName" TEXT,
    "date" DATETIME NOT NULL,
    "originalDescription" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "kindHint" TEXT NOT NULL,
    "categoryId" TEXT,
    "categorySource" TEXT,
    "installmentNumber" INTEGER,
    "installmentTotal" INTEGER,
    "include" BOOLEAN NOT NULL DEFAULT true,
    "duplicateStatus" TEXT NOT NULL DEFAULT 'NEW',
    "duplicateOfId" TEXT,
    "note" TEXT,
    "sourceHash" TEXT NOT NULL,
    "transactionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ImportSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Transaction
ALTER TABLE "Transaction" ADD COLUMN "importSessionId" TEXT CONSTRAINT "Transaction_importSessionId_fkey" REFERENCES "ImportSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD COLUMN "sourceHash" TEXT;

-- Indexes
CREATE INDEX "ImportSession_householdId_createdAt_idx" ON "ImportSession"("householdId", "createdAt");
CREATE INDEX "ImportItem_sessionId_position_idx" ON "ImportItem"("sessionId", "position");
CREATE INDEX "Transaction_importSessionId_idx" ON "Transaction"("importSessionId");
CREATE INDEX "Transaction_householdId_sourceHash_idx" ON "Transaction"("householdId", "sourceHash");
