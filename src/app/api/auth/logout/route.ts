import { destroySession, requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/http";
import { errorResponse } from "@/lib/errors";
export async function POST(request: Request) {
  try {
    await requireAdmin();
    assertSameOrigin(request);
    await destroySession();
    return Response.json({ message: "Berhasil keluar." });
  } catch (error) {
    return errorResponse(error);
  }
}
