import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/http";
import { errorResponse, AppError } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    assertSameOrigin(request);
    // Keep the URL explicit for old clients; do not read, update or delete historical preparations.
    throw new AppError("Laporan sekarang dihitung otomatis dari data tercatat. Isian pelengkap manual tidak digunakan lagi; muat ulang halaman Laporan.", 410);
  } catch (error) { return errorResponse(error); }
}
