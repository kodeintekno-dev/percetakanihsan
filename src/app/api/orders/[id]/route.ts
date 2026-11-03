import { requireAdmin } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { assertSameOrigin, readJson } from "@/lib/http";
import { errorResponse } from "@/lib/errors";
import { getOrder, saveOrder, removeOrder } from "@/features/orders/service";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    await requireAdmin();
    return Response.json(await getOrder((await context.params).id), {
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
    const order = await saveOrder(
      await readJson(request),
      (await context.params).id,
    );
    revalidatePath("/dashboard");
    revalidatePath("/permintaan");
    return Response.json({ order, message: "Permintaan berhasil diperbarui." });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    await requireAdmin();
    assertSameOrigin(request);
    const result = await removeOrder(
      (await context.params).id,
      await readJson(request),
    );
    revalidatePath("/dashboard");
    revalidatePath("/permintaan");
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
