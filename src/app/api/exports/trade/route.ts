import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { todayJakarta } from "@/lib/date";
import { parseTradeFilters } from "@/features/trade/schema";
import { allInvoiceExport } from "@/features/trade/export-data";
import { tradeCsv, tradeXlsx } from "@/features/trade/export";
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
    const filters = parseTradeFilters(params),
      data = await allInvoiceExport(filters);
    return new Response(
      format === "csv" ? tradeCsv(data) : await tradeXlsx(data, filters),
      {
        headers: {
          "Content-Type":
            format === "csv"
              ? "text/csv; charset=utf-8"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filters.kind === "RECEIVABLE" ? "piutang" : "hutang"}-${todayJakarta()}.${format}"`,
          "Cache-Control": "private, no-store",
          "X-Export-Row-Count": String(data.invoices.length),
          "X-Export-Payment-Count": String(data.payments.length),
        },
      },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
