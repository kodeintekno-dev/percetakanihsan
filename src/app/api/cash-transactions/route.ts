import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin, readJson } from "@/lib/http";
import { errorResponse } from "@/lib/errors";
import { parseCashFilters } from "@/features/cash/schema";
import { listCash, createCash } from "@/features/cash/service";
import { revalidatePath } from "next/cache";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    return Response.json(
      await listCash(parseCashFilters(new URL(request.url).searchParams)),
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
    const result = await createCash(await readJson(request));
    revalidatePath("/dashboard");
    revalidatePath("/buku-kas");
    return Response.json(
      {
        transaction: result.row,
        replayed: result.replayed,
        message: result.replayed
          ? "Transaksi sudah tercatat. Pencatatan ganda dicegah."
          : "Transaksi berhasil dicatat.",
      },
      { status: result.replayed ? 200 : 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
