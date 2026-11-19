import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { errorResponse, AppError } from "@/lib/errors";
import {
  parseReportFilters,
  reportRevisionSchema,
} from "@/features/reports/schema";
import { getReport } from "@/features/reports/service";
import { reportsCsv, reportsXlsx } from "@/features/reports/export";
import { statementCsv, statementXlsx } from "@/features/reports/statement-export";
import { buildStatement, statementKindSchema, type StatementKind } from "@/features/reports/statements";
import type { ReportData } from "@/features/reports/schema";
import { assertSameOrigin, readJson } from "@/lib/http";
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
    const kinds = params.getAll("statement");
    const kind = kinds.length ? statementKindSchema.parse(kinds.length === 1 ? kinds[0] : null) : undefined;
    params.delete("statement");
    const data = await getReport(parseReportFilters(params));
    if (revision && revision !== data.revision)
      throw new AppError(
        "Data berubah sejak laporan ditampilkan. Muat ulang laporan, lalu ekspor kembali.",
        409,
      );
    if (kind) return await statementResponse(data, kind, format);
    // Preserve the old complete-export URL for existing integrations. The UI always selects a statement.
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

export async function POST(request: Request) {
  try {
    await requireAdmin();
    assertSameOrigin(request);
    const body = z.object({
      filters: z.record(z.string(), z.unknown()),
      statement: statementKindSchema,
      format: z.enum(["csv", "xlsx"]),
      revision: reportRevisionSchema,
    }).strict().parse(await readJson(request));
    const data = await getReport(parseReportFilters(body.filters));
    if (body.revision !== data.revision) throw new AppError("Data berubah sejak laporan ditampilkan. Muat ulang laporan, lalu ekspor kembali.", 409);
    return await statementResponse(data, body.statement, body.format);
  } catch (error) { return errorResponse(error); }
}

async function statementResponse(data: ReportData, kind: StatementKind, format: "csv" | "xlsx") {
  const report = buildStatement(data, kind);
  const period = kind === "neraca" ? data.period.end : `${data.period.start}_${data.period.end}`;
  return new Response(format === "csv" ? statementCsv(report) : await statementXlsx(report), {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${kind}-${period}.${format}"`,
      "Cache-Control": "private, no-store",
      "X-Report-Revision": data.revision,
      "X-Report-Status": report.status,
    },
  });
}
