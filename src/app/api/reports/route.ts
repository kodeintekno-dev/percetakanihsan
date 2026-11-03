import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { parseReportFilters } from "@/features/reports/schema";
import { getReport } from "@/features/reports/service";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    return Response.json(
      await getReport(parseReportFilters(new URL(request.url).searchParams)),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
