import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { parseCashFilters } from "@/features/cash/schema";
import { allFilteredCash } from "@/features/cash/service";
import { cashCsv, cashXlsx } from "@/features/cash/export";
import { todayJakarta } from "@/lib/date";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams;
    const format = z.enum(["csv", "xlsx"]).parse(params.get("format"));
    const filters = parseCashFilters(params),
      rows = await allFilteredCash(filters);
    return new Response(
      format === "csv" ? cashCsv(rows) : await cashXlsx(rows, filters),
      {
        headers: {
          "Content-Type":
            format === "csv"
              ? "text/csv; charset=utf-8"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="buku-kas-${todayJakarta()}.${format}"`,
          "Cache-Control": "private, no-store",
          "X-Export-Row-Count": String(rows.length),
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
