import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin, readJson } from "@/lib/http";
import { errorResponse } from "@/lib/errors";
import { getCash, editCash, deleteCash } from "@/features/cash/service";
import { revalidatePath } from "next/cache";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    await requireAdmin();
    return Response.json(await getCash((await context.params).id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    await requireAdmin();
    assertSameOrigin(request);
    const row = await editCash(
      (await context.params).id,
      await readJson(request),
    );
    revalidatePath("/dashboard");
    revalidatePath("/buku-kas");
    return Response.json({
      transaction: row,
      message: "Transaksi diperbarui. Hitungan kas mengikuti data terbaru.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    await requireAdmin();
    assertSameOrigin(request);
    const result = await deleteCash(
      (await context.params).id,
      await readJson(request),
    );
    revalidatePath("/dashboard");
    revalidatePath("/buku-kas");
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
