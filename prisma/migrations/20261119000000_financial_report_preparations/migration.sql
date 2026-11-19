-- Additive only: no UPDATE, DELETE, ALTER or backfill on existing business tables.
CREATE TABLE "FinancialReportPreparation" (
    "id" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "version" INTEGER NOT NULL,
    "values" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialReportPreparation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FinancialReportPreparation_version_check" CHECK ("version" > 0),
    CONSTRAINT "FinancialReportPreparation_dates_check" CHECK ("startDate" <= "endDate")
);

CREATE UNIQUE INDEX "FinancialReportPreparation_startDate_endDate_version_key"
ON "FinancialReportPreparation"("startDate", "endDate", "version");
