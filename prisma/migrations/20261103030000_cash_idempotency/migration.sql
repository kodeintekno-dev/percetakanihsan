-- Additive: data kas yang sudah ada tidak diubah atau dihapus.
ALTER TABLE "CashTransaction" ADD COLUMN "requestKey" TEXT;
ALTER TABLE "CashTransaction" ADD COLUMN "requestHash" TEXT;
CREATE UNIQUE INDEX "CashTransaction_requestKey_key" ON "CashTransaction"("requestKey");
