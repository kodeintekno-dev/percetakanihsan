import { z } from "zod";
import { queryObject } from "@/lib/validation";
import { paymentCandidates } from "@/features/trade/service";
import { tradeRead } from "@/features/trade/http";
const schema = z
  .object({
    q: z.string().trim().max(150).default(""),
    page: z.coerce.number().int().min(1).max(2147483647).default(1),
  })
  .strict();
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return tradeRead(() => {
    const q = schema.parse(queryObject(new URL(request.url).searchParams));
    return paymentCandidates(id, q.q, q.page);
  });
}
