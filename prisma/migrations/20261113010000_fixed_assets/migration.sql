CREATE TABLE "FixedAsset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "acquisitionCost" DECIMAL(18,0) NOT NULL,
  "startDate" DATE NOT NULL,
  "usefulMonths" INTEGER NOT NULL,
  "stopDate" DATE,
  "purchaseCashId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asset_positive_values" CHECK (length(btrim("name")) > 0 AND "acquisitionCost" > 0 AND "usefulMonths" BETWEEN 1 AND 1200),
  CONSTRAINT "asset_stop_date" CHECK ("stopDate" IS NULL OR "stopDate" >= "startDate"),
  CONSTRAINT "FixedAsset_purchaseCashId_fkey" FOREIGN KEY ("purchaseCashId") REFERENCES "CashTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FixedAsset_purchaseCashId_key" ON "FixedAsset"("purchaseCashId");
