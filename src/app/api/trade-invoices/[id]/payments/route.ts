import { recordPayment } from "@/features/trade/service";
import { tradeWrite } from "@/features/trade/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return tradeWrite(request, (body) => recordPayment(id, body), 201);
}
