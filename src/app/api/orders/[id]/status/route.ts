import { requireAdmin } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { assertSameOrigin, readJson } from "@/lib/http";
import { errorResponse } from "@/lib/errors";
import { changeOrderStatus } from "@/features/orders/service";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    assertSameOrigin(request);
    const order = await changeOrderStatus(
      (await context.params).id,
      await readJson(request),
    );
    revalidatePath("/dashboard");
    revalidatePath("/permintaan");
    return Response.json({
      order,
      message: "Status permintaan berhasil diperbarui.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
