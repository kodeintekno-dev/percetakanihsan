import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { getFinancialSummary } from "@/features/cash/aggregates";
import { financePeriodSchema } from "@/features/cash/schema";
import { queryObject } from "@/lib/validation";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const period = financePeriodSchema.parse(
      queryObject(new URL(request.url).searchParams),
    );
    return Response.json(await getFinancialSummary(period.start, period.end), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
