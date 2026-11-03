import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin, readJson } from "@/lib/http";
import { errorResponse } from "@/lib/errors";
import { parseBudgetFilters } from "@/features/budget/schema";
import { listBudgets, saveBudget } from "@/features/budget/service";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    return Response.json(
      await listBudgets(parseBudgetFilters(new URL(request.url).searchParams)),
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
    const budget = await saveBudget(await readJson(request, 1_048_576));
    revalidatePath("/budgeting");
    return Response.json(
      {
        budget,
        message:
          "Estimasi berhasil disimpan. Tidak ada transaksi kas yang dibuat.",
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
