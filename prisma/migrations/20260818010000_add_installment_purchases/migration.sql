-- CreateTable
CREATE TABLE "InstallmentPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "totalAmount" REAL NOT NULL,
    "installmentsCount" INTEGER NOT NULL,
    "purchaseDate" DATETIME NOT NULL,
    "categoryId" TEXT,
    "creditCardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstallmentPurchase_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InstallmentPurchase_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InstallmentPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventDate" DATETIME NOT NULL,
    "settlementDate" DATETIME,
    "categoryId" TEXT,
    "paymentMethod" TEXT NOT NULL DEFAULT 'DEBITO',
    "bankId" TEXT,
    "creditCardId" TEXT,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceRule" TEXT,
    "installmentPurchaseId" TEXT,
    "installmentNumber" INTEGER,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_installmentPurchaseId_fkey" FOREIGN KEY ("installmentPurchaseId") REFERENCES "InstallmentPurchase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("amount", "bankId", "categoryId", "createdAt", "creditCardId", "description", "eventDate", "id", "isRecurring", "paymentMethod", "recurrenceRule", "settlementDate", "status", "updatedAt", "userId") SELECT "amount", "bankId", "categoryId", "createdAt", "creditCardId", "description", "eventDate", "id", "isRecurring", "paymentMethod", "recurrenceRule", "settlementDate", "status", "updatedAt", "userId" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_eventDate_idx" ON "Transaction"("eventDate");
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");
CREATE INDEX "Transaction_bankId_idx" ON "Transaction"("bankId");
CREATE INDEX "Transaction_creditCardId_idx" ON "Transaction"("creditCardId");
CREATE INDEX "Transaction_installmentPurchaseId_idx" ON "Transaction"("installmentPurchaseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "InstallmentPurchase_creditCardId_idx" ON "InstallmentPurchase"("creditCardId");

-- CreateIndex
CREATE INDEX "InstallmentPurchase_categoryId_idx" ON "InstallmentPurchase"("categoryId");

