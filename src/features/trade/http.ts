import "server-only";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin, readJson } from "@/lib/http";
import { errorResponse } from "@/lib/errors";
export async function tradeRead(run: () => Promise<unknown>) {
  try {
    await requireAdmin();
    return Response.json(await run(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function tradeWrite(
  request: Request,
  run: (body: unknown) => Promise<unknown>,
  status = 200,
) {
  try {
    await requireAdmin();
    assertSameOrigin(request);
    return Response.json(await run(await readJson(request)), {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
