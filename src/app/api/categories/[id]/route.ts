import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin, readJson } from "@/lib/http";
import { errorResponse } from "@/lib/errors";
import { saveCategory, deleteCategory } from "@/features/categories/service";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    await requireAdmin();
    assertSameOrigin(request);
    await saveCategory(await readJson(request), (await context.params).id);
    return Response.json({ message: "Kategori berhasil diperbarui." });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    await requireAdmin();
    assertSameOrigin(request);
    return Response.json(await deleteCategory((await context.params).id));
  } catch (error) {
    return errorResponse(error);
  }
}
