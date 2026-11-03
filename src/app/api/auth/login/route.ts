import { login } from "@/features/auth/service";
import { assertSameOrigin, readJson } from "@/lib/http";
import { errorResponse } from "@/lib/errors";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await login(await readJson(request));
    return Response.json({ message: "Berhasil masuk." });
  } catch (error) {
    return errorResponse(error);
  }
}
