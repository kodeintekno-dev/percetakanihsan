import { voidPayment } from "@/features/trade/service";
import { tradeWrite } from "@/features/trade/http";
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  const { id, paymentId } = await params;
  return tradeWrite(request, (body) => voidPayment(id, paymentId, body));
}
