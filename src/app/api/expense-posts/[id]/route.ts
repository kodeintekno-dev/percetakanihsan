import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin, readJson } from "@/lib/http";
import { errorResponse } from "@/lib/errors";
import { saveExpense, deleteExpense } from "@/features/expenses/service";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    await requireAdmin();
    assertSameOrigin(request);
    await saveExpense(await readJson(request), (await context.params).id);
    return Response.json({
      message:
        "Pos berhasil diperbarui. Klasifikasi transaksi lama tetap mengikuti snapshot.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    await requireAdmin();
    assertSameOrigin(request);
    return Response.json(await deleteExpense((await context.params).id));
  } catch (error) {
    return errorResponse(error);
  }
}
