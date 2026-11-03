import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin, readJson } from "@/lib/http";
import { errorResponse } from "@/lib/errors";
import { getCategoryRows, saveCategory } from "@/features/categories/service";
export async function GET() {
  try {
    await requireAdmin();
    return Response.json(await getCategoryRows(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    await requireAdmin();
    assertSameOrigin(request);
    await saveCategory(await readJson(request));
    return Response.json(
      { message: "Kategori berhasil ditambahkan." },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
