import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { errorResponse, AppError } from "@/lib/errors";
import {
  parseReportFilters,
  reportRevisionSchema,
} from "@/features/reports/schema";
import { getReport } from "@/features/reports/service";
import { reportsCsv, reportsXlsx } from "@/features/reports/export";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams,
      formats = params.getAll("format");
    const format = z
      .enum(["csv", "xlsx"])
      .parse(formats.length === 1 ? formats[0] : null);
    params.delete("format");
    const revisions = params.getAll("revision"),
      revision = revisions.length
        ? reportRevisionSchema.parse(
            revisions.length === 1 ? revisions[0] : null,
          )
        : undefined;
    params.delete("revision");
    const data = await getReport(parseReportFilters(params));
    if (revision && revision !== data.revision)
      throw new AppError(
        "Data berubah sejak laporan ditampilkan. Muat ulang laporan, lalu ekspor kembali.",
        409,
      );
    return new Response(
      format === "csv" ? reportsCsv(data) : await reportsXlsx(data),
      {
        headers: {
          "Content-Type":
            format === "csv"
              ? "text/csv; charset=utf-8"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="laporan-${data.period.start}_${data.period.end}.${format}"`,
          "Cache-Control": "private, no-store",
          "X-Report-Revision": data.revision,
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
