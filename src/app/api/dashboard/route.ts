import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { getDashboard } from "@/features/cash/aggregates";
export async function GET() {
  try {
    await requireAdmin();
    return Response.json(await getDashboard(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
