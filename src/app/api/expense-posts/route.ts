import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin, readJson } from "@/lib/http";
import { errorResponse } from "@/lib/errors";
import { getExpenseRows, saveExpense } from "@/features/expenses/service";
export async function GET() {
  try {
    await requireAdmin();
    return Response.json(await getExpenseRows(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    await requireAdmin();
    assertSameOrigin(request);
    await saveExpense(await readJson(request));
    return Response.json(
      { message: "Pos berhasil ditambahkan." },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
