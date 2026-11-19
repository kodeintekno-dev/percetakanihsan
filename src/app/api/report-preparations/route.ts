import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin, readJson } from "@/lib/http";
import { errorResponse, AppError } from "@/lib/errors";
import { parseReportFilters, reportRevisionSchema } from "@/features/reports/schema";
import { getReport } from "@/features/reports/service";
import { preparationSchema } from "@/features/reports/statements";
import { savePreparation } from "@/features/reports/preparation-service";

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    assertSameOrigin(request);
    const body = z.object({ filters: z.record(z.string(), z.unknown()), values: preparationSchema, expectedVersion: z.number().int().min(0).max(2_147_483_646), revision: reportRevisionSchema }).strict().parse(await readJson(request));
    const filters = parseReportFilters(body.filters), data = await getReport(filters);
    if (data.revision !== body.revision) throw new AppError("Data berubah sejak laporan dibuka. Muat ulang dan periksa pelengkap sebelum menyimpan.", 409);
    return Response.json(await savePreparation(filters, body.values, body.expectedVersion, admin.id, data.sourceRevision!), {
      status: 201, headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) { return errorResponse(error); }
}
