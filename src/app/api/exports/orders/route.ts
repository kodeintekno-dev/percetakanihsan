import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { parseOrderFilters } from "@/features/orders/schema";
import { allFilteredOrders } from "@/features/orders/service";
import { ordersCsv, ordersXlsx } from "@/features/orders/export";
import { todayJakarta } from "@/lib/date";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams;
    const format = z.enum(["xlsx", "csv"]).parse(params.get("format"));
    const filters = parseOrderFilters(params);
    const rows = await allFilteredOrders(filters);
    const headers = {
      "Content-Type":
        format === "csv"
          ? "text/csv; charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="permintaan-${todayJakarta()}.${format}"`,
      "Cache-Control": "private, no-store",
      "X-Export-Row-Count": String(rows.length),
    };
    return new Response(
      format === "csv" ? ordersCsv(rows) : await ordersXlsx(rows, filters),
      { headers },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
