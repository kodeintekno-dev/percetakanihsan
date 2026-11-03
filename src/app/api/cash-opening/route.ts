import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin, readJson } from "@/lib/http";
import { errorResponse } from "@/lib/errors";
import { getOpeningSettings, saveOpening } from "@/features/cash/service";
import { revalidatePath } from "next/cache";
export async function GET() {
  try {
    await requireAdmin();
    return Response.json(await getOpeningSettings(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PUT(request: Request) {
  try {
    await requireAdmin();
    assertSameOrigin(request);
    const opening = await saveOpening(await readJson(request));
    revalidatePath("/dashboard");
    revalidatePath("/pengaturan");
    return Response.json({
      opening,
      message:
        "Saldo pembukaan disimpan. Tidak ada transaksi pemasukan yang dibuat.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
