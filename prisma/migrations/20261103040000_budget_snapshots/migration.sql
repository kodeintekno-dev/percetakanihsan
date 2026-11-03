-- Tambahan snapshot dan pelebaran presisi: tidak membuang record/data lama.
ALTER TABLE "BudgetEstimate"
 ADD COLUMN "orderNumberSnapshot" TEXT,
 ADD COLUMN "customerNameSnapshot" TEXT,
 ALTER COLUMN "marginValue" TYPE DECIMAL(20,2),
 ALTER COLUMN "hppPerUnit" TYPE DECIMAL(25,4);
ALTER TABLE "BudgetCostItem" ADD COLUMN "fromPaperCut" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "BudgetCostItem_one_paper_cut_per_budget"
 ON "BudgetCostItem"("budgetId") WHERE "fromPaperCut";
ALTER TABLE "BudgetCostItem" ADD CONSTRAINT "paper_material_cost_type"
 CHECK (NOT "fromPaperCut" OR "costType" = 'PAPER');
ALTER TABLE "PaperCutSimulation"
 ALTER COLUMN "originalYield" TYPE DECIMAL(24,0),
 ALTER COLUMN "rotatedYield" TYPE DECIMAL(24,0),
 ALTER COLUMN "chosenYield" TYPE DECIMAL(24,0),
 ALTER COLUMN "wasteAreaCm2" TYPE DECIMAL(24,4),
 ALTER COLUMN "requiredFinishedPieces" TYPE DECIMAL(18,0),
 ALTER COLUMN "requiredParentSheets" TYPE DECIMAL(18,0),
 ADD COLUMN "calculationSnapshot" JSONB;
