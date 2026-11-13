import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin, readJson } from "@/lib/http";
import { errorResponse } from "@/lib/errors";
import { listAssets, createAsset } from "@/features/assets/service";
export async function GET() {
  try {
    await requireAdmin();
    return Response.json(await listAssets(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    await requireAdmin();
    assertSameOrigin(request);
    return Response.json(await createAsset(await readJson(request)), {
      status: 201,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
