import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { z } from "zod";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const q = z
      .string()
      .max(150)
      .parse(new URL(request.url).searchParams.get("q") ?? "");
    const rows = await getDb().cashTransaction.findMany({
      where: {
        type: "EXPENSE",
        deletedAt: null,
        purchasedAsset: null,
        description: { contains: q, mode: "insensitive" },
      },
      take: 20,
      orderBy: [{ transactionDate: "desc" }, { id: "asc" }],
    });
    return Response.json(
      rows.map((r) => ({
        id: r.id,
        description: r.description,
        amount: r.amount.toFixed(0),
      })),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
