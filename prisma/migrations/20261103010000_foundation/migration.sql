-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ExpenseGroup" AS ENUM ('PRODUCTION', 'OPERATIONAL', 'MARKETING');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'COMPLETED', 'PICKED_UP');

-- CreateEnum
CREATE TYPE "CashType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "IncomeKind" AS ENUM ('SALE', 'OTHER');

-- CreateEnum
CREATE TYPE "MarginMode" AS ENUM ('PERCENT_MARKUP', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "CostType" AS ENUM ('PAPER', 'INK_PRINT', 'FINISHING', 'MACHINE_LABOR', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CutOrientation" AS ENUM ('ORIGINAL', 'ROTATED');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginThrottle" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SeedRun" (
    "key" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeedRun_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpensePost" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "group" "ExpenseGroup" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpensePost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "orderDate" DATE NOT NULL,
    "customerName" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "subcategoryId" TEXT,
    "categoryNameSnapshot" TEXT NOT NULL,
    "productNameSnapshot" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,0) NOT NULL,
    "totalPrice" DECIMAL(18,0) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PrintOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashTransaction" (
    "id" TEXT NOT NULL,
    "transactionDate" DATE NOT NULL,
    "type" "CashType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,0) NOT NULL,
    "expensePostId" TEXT,
    "expenseGroupSnapshot" "ExpenseGroup",
    "incomeKind" "IncomeKind",
    "categoryId" TEXT,
    "subcategoryId" TEXT,
    "categoryNameSnapshot" TEXT,
    "productNameSnapshot" TEXT,
    "orderId" TEXT,
    "soldQuantity" DECIMAL(18,3),
    "soldUnit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CashTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashOpeningSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "openingDate" DATE NOT NULL,
    "openingAmount" DECIMAL(18,0) NOT NULL,
    "isConfigured" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashOpeningSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetEstimate" (
    "id" TEXT NOT NULL,
    "budgetNumber" TEXT NOT NULL,
    "orderId" TEXT,
    "categoryId" TEXT,
    "subcategoryId" TEXT,
    "categoryNameSnapshot" TEXT,
    "productNameSnapshot" TEXT,
    "title" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "marginMode" "MarginMode" NOT NULL,
    "marginValue" DECIMAL(18,2) NOT NULL,
    "totalHpp" DECIMAL(18,0) NOT NULL,
    "hppPerUnit" DECIMAL(18,4) NOT NULL,
    "suggestedSellingTotal" DECIMAL(18,0) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BudgetEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetCostItem" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "costType" "CostType" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitCost" DECIMAL(18,0) NOT NULL,
    "totalCost" DECIMAL(18,0) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BudgetCostItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperCutSimulation" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "sheetLengthCm" DECIMAL(12,2) NOT NULL,
    "sheetWidthCm" DECIMAL(12,2) NOT NULL,
    "cutLengthCm" DECIMAL(12,2) NOT NULL,
    "cutWidthCm" DECIMAL(12,2) NOT NULL,
    "selectedOrientation" "CutOrientation" NOT NULL,
    "originalYield" INTEGER NOT NULL,
    "rotatedYield" INTEGER NOT NULL,
    "chosenYield" INTEGER NOT NULL,
    "wasteAreaCm2" DECIMAL(18,4) NOT NULL,
    "paperPricePerSheet" DECIMAL(18,0),
    "requiredFinishedPieces" INTEGER,
    "requiredParentSheets" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperCutSimulation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "LoginThrottle_expiresAt_idx" ON "LoginThrottle"("expiresAt");

-- CreateIndex
CREATE INDEX "ProductCategory_isActive_parentId_idx" ON "ProductCategory"("isActive", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_parentId_nameKey_key" ON "ProductCategory"("parentId", "nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExpensePost_nameKey_key" ON "ExpensePost"("nameKey");

-- CreateIndex
CREATE INDEX "ExpensePost_isActive_group_idx" ON "ExpensePost"("isActive", "group");

-- CreateIndex
CREATE UNIQUE INDEX "PrintOrder_orderNumber_key" ON "PrintOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "PrintOrder_orderDate_idx" ON "PrintOrder"("orderDate");

-- CreateIndex
CREATE INDEX "PrintOrder_status_orderDate_idx" ON "PrintOrder"("status", "orderDate");

-- CreateIndex
CREATE INDEX "PrintOrder_categoryId_orderDate_idx" ON "PrintOrder"("categoryId", "orderDate");

-- CreateIndex
CREATE INDEX "PrintOrder_subcategoryId_idx" ON "PrintOrder"("subcategoryId");

-- CreateIndex
CREATE INDEX "CashTransaction_transactionDate_type_idx" ON "CashTransaction"("transactionDate", "type");

-- CreateIndex
CREATE INDEX "CashTransaction_expensePostId_transactionDate_idx" ON "CashTransaction"("expensePostId", "transactionDate");

-- CreateIndex
CREATE INDEX "CashTransaction_categoryId_transactionDate_idx" ON "CashTransaction"("categoryId", "transactionDate");

-- CreateIndex
CREATE INDEX "CashTransaction_subcategoryId_idx" ON "CashTransaction"("subcategoryId");

-- CreateIndex
CREATE INDEX "CashTransaction_orderId_idx" ON "CashTransaction"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetEstimate_budgetNumber_key" ON "BudgetEstimate"("budgetNumber");

-- CreateIndex
CREATE INDEX "BudgetEstimate_orderId_idx" ON "BudgetEstimate"("orderId");

-- CreateIndex
CREATE INDEX "BudgetEstimate_categoryId_idx" ON "BudgetEstimate"("categoryId");

-- CreateIndex
CREATE INDEX "BudgetEstimate_subcategoryId_idx" ON "BudgetEstimate"("subcategoryId");

-- CreateIndex
CREATE INDEX "BudgetEstimate_createdAt_idx" ON "BudgetEstimate"("createdAt");

-- CreateIndex
CREATE INDEX "BudgetCostItem_budgetId_sortOrder_idx" ON "BudgetCostItem"("budgetId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PaperCutSimulation_budgetId_key" ON "PaperCutSimulation"("budgetId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintOrder" ADD CONSTRAINT "PrintOrder_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintOrder" ADD CONSTRAINT "PrintOrder_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_expensePostId_fkey" FOREIGN KEY ("expensePostId") REFERENCES "ExpensePost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PrintOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetEstimate" ADD CONSTRAINT "BudgetEstimate_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PrintOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetEstimate" ADD CONSTRAINT "BudgetEstimate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetEstimate" ADD CONSTRAINT "BudgetEstimate_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetCostItem" ADD CONSTRAINT "BudgetCostItem_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "BudgetEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperCutSimulation" ADD CONSTRAINT "PaperCutSimulation_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "BudgetEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
