import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";

export const runtime = "nodejs";

const filename = "buku-panduan-cv-ihsan-mandiri.pdf";

export async function GET() {
  try {
    await requireAdmin();
    const pdf = await readFile(join(process.cwd(), "output", "pdf", filename));

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
