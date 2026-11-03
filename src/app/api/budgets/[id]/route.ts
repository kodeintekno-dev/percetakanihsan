import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin, readJson } from "@/lib/http";
import { errorResponse } from "@/lib/errors";
import { getBudget, saveBudget, deleteBudget } from "@/features/budget/service";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    await requireAdmin();
    return Response.json(await getBudget((await context.params).id), {
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
    const id = (await context.params).id,
      budget = await saveBudget(await readJson(request, 1_048_576), id);
    revalidatePath("/budgeting");
    revalidatePath(`/budgeting/${id}`);
    return Response.json({
      budget,
      message: "Estimasi diperbarui. Kas tetap tidak berubah.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    await requireAdmin();
    assertSameOrigin(request);
    const id = (await context.params).id,
      result = await deleteBudget(id, await readJson(request));
    revalidatePath("/budgeting");
    revalidatePath(`/budgeting/${id}`);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
