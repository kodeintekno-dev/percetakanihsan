import "server-only";
import { appOrigin } from "./env";
import { AppError } from "./errors";

export function assertSameOrigin(request: Request) {
  if (request.headers.get("origin") !== appOrigin())
    throw new AppError("Permintaan dari sumber ini tidak diizinkan.", 403);
}

export async function readJson(request: Request, maxBytes = 16_384) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError("Gunakan data JSON.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Data wajib diisi.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AppError("Data terlalu besar.", 413);
    }
    chunks.push(part.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new AppError("Format data tidak valid.");
  }
}
