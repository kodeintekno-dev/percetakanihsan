import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { databaseDate } from "@/lib/date";
import { AppError } from "@/lib/app-error";
import { reportPeriod, type ReportFilters } from "./schema";
import { preparationSchema, type ReportPreparation } from "./statements";

export async function readPreparation(tx: Prisma.TransactionClient, start: string, end: string) {
  // Check without querying a missing table: a failed SELECT would abort the enclosing transaction.
  const tables = await tx.$queryRaw<{ present: boolean }[]>`
    SELECT to_regclass('"FinancialReportPreparation"') IS NOT NULL AS present
  `;
  if (!tables[0]?.present) return { available: false, version: 0, values: preparationSchema.parse({}), savedAt: null, sourceRevision: null };
  const record = await tx.financialReportPreparation.findFirst({
    where: { startDate: databaseDate(start), endDate: databaseDate(end) },
    orderBy: { version: "desc" },
  });
  const envelope = record ? z.object({ schemaVersion: z.literal(1), sourceRevision: z.string().regex(/^[a-f0-9]{64}$/), values: preparationSchema }).safeParse(record.values) : null;
  return {
    available: true,
    version: record?.version ?? 0,
    values: envelope?.success ? envelope.data.values : record ? preparationSchema.parse(record.values) : preparationSchema.parse({}),
    sourceRevision: envelope?.success ? envelope.data.sourceRevision : null,
    savedAt: record?.createdAt.toISOString() ?? null,
  };
}

export async function savePreparation(filters: ReportFilters, input: ReportPreparation, expectedVersion: number, adminId: string, sourceRevision: string) {
  const period = reportPeriod(filters), values = preparationSchema.parse(input);
  z.string().regex(/^[a-f0-9]{64}$/).parse(sourceRevision);
  try {
    return await getDb().$transaction(async tx => {
      const current = await readPreparation(tx, period.start, period.end);
      if (!current.available) throw new AppError("Penyimpanan pelengkap belum diaktifkan. Gunakan isian sementara untuk pratinjau/ekspor; migrasi perlu diterapkan terpisah oleh pengelola.", 503);
      if (current.version !== expectedVersion) throw new AppError("Pelengkap berubah sejak dibuka. Muat ulang laporan sebelum menyimpan versi baru.", 409);
      const record = await tx.financialReportPreparation.create({ data: {
        startDate: databaseDate(period.start), endDate: databaseDate(period.end),
        version: current.version + 1, values: { schemaVersion: 1, sourceRevision, values }, createdBy: adminId,
      } });
      return { version: record.version, savedAt: record.createdAt.toISOString() };
    }, { isolationLevel: "RepeatableRead" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code))
      throw new AppError("Pelengkap berubah saat disimpan. Muat ulang laporan dan coba kembali.", 409);
    throw error;
  }
}
