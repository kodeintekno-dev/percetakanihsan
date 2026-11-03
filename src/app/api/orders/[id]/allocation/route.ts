import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { getOrderAllocation } from "@/features/cash/service";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    return Response.json(
      await getOrderAllocation(
        (await context.params).id,
        new URL(request.url).searchParams.get("excludeTransactionId") ||
          undefined,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
