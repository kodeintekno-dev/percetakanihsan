import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin, readJson } from "@/lib/http";
import { errorResponse } from "@/lib/errors";
import { stopAsset } from "@/features/assets/service";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    assertSameOrigin(request);
    return Response.json(
      await stopAsset((await context.params).id, await readJson(request)),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
