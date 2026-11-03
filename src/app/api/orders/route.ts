import { requireAdmin } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { assertSameOrigin, readJson } from "@/lib/http";
import { errorResponse } from "@/lib/errors";
import { parseOrderFilters } from "@/features/orders/schema";
import { listOrders, saveOrder } from "@/features/orders/service";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    return Response.json(
      await listOrders(parseOrderFilters(new URL(request.url).searchParams)),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    await requireAdmin();
    assertSameOrigin(request);
    const order = await saveOrder(await readJson(request));
    revalidatePath("/dashboard");
    revalidatePath("/permintaan");
    return Response.json(
      { order, message: "Permintaan berhasil ditambahkan." },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
