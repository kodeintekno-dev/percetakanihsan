-- Penambahan tabel saja: tidak mengubah, menghapus, atau menebak tagihan dari data lama.
BEGIN;
CREATE TYPE "TradeKind" AS ENUM ('RECEIVABLE', 'PAYABLE');
CREATE TABLE "TradeInvoice" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestHash" TEXT NOT NULL,
  "kind" "TradeKind" NOT NULL,
  "reference" TEXT NOT NULL,
  "referenceKey" TEXT NOT NULL,
  "partyName" TEXT NOT NULL,
  "issueDate" DATE NOT NULL,
  "dueDate" DATE NOT NULL,
  "amount" DECIMAL(18,0) NOT NULL,
  "paidAmount" DECIMAL(18,0) NOT NULL DEFAULT 0,
  "orderId" TEXT REFERENCES "PrintOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "orderNumberSnapshot" TEXT,
  "categoryId" TEXT,
  "subcategoryId" TEXT,
  "categoryNameSnapshot" TEXT,
  "productNameSnapshot" TEXT,
  "expensePostId" TEXT REFERENCES "ExpensePost"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "expenseGroupSnapshot" "ExpenseGroup",
  "notes" TEXT NOT NULL DEFAULT '',
  "cancelledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "trade_amounts" CHECK ("amount" > 0 AND "paidAmount" >= 0 AND "paidAmount" <= "amount"),
  CONSTRAINT "trade_dates" CHECK ("dueDate" >= "issueDate"),
  CONSTRAINT "trade_names" CHECK (length(trim("reference")) > 0 AND length(trim("partyName")) > 0),
  CONSTRAINT "trade_fields" CHECK (
    ("kind" = 'RECEIVABLE' AND "orderId" IS NOT NULL AND "categoryId" IS NOT NULL AND "expensePostId" IS NULL AND "expenseGroupSnapshot" IS NULL)
    OR ("kind" = 'PAYABLE' AND "expensePostId" IS NOT NULL AND "expenseGroupSnapshot" IS NOT NULL AND "categoryId" IS NULL AND "subcategoryId" IS NULL)
  ),
  CONSTRAINT "trade_cancel" CHECK ("cancelledAt" IS NULL OR ("paidAmount" = 0 AND length(trim("cancelReason")) > 0))
);
CREATE UNIQUE INDEX "TradeInvoice_kind_referenceKey_key" ON "TradeInvoice"("kind", "referenceKey");
CREATE UNIQUE INDEX "trade_one_active_receivable_order" ON "TradeInvoice"("orderId") WHERE "kind" = 'RECEIVABLE' AND "cancelledAt" IS NULL;
CREATE INDEX "TradeInvoice_kind_cancelledAt_dueDate_idx" ON "TradeInvoice"("kind", "cancelledAt", "dueDate");
CREATE INDEX "TradeInvoice_orderId_idx" ON "TradeInvoice"("orderId");
CREATE INDEX "TradeInvoice_expensePostId_idx" ON "TradeInvoice"("expensePostId");
CREATE TABLE "TradePayment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestHash" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL REFERENCES "TradeInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "cashId" TEXT NOT NULL REFERENCES "CashTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "amount" DECIMAL(18,0) NOT NULL CHECK ("amount" > 0),
  "createdCash" BOOLEAN NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "voidedAt" TIMESTAMP(3),
  "voidReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trade_void_reason" CHECK ("voidedAt" IS NULL OR length(trim("voidReason")) > 0)
);
CREATE UNIQUE INDEX "trade_one_active_cash_payment" ON "TradePayment"("cashId") WHERE "voidedAt" IS NULL;
CREATE INDEX "TradePayment_invoiceId_voidedAt_idx" ON "TradePayment"("invoiceId", "voidedAt");
CREATE INDEX "TradePayment_cashId_idx" ON "TradePayment"("cashId");
COMMIT;
