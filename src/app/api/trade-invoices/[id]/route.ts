import {
  getInvoice,
  editInvoice,
  cancelInvoice,
} from "@/features/trade/service";
import { tradeRead, tradeWrite } from "@/features/trade/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  return tradeRead(() => getInvoice(id));
}
export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  return tradeWrite(request, (body) => editInvoice(id, body));
}
export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return tradeWrite(request, (body) => cancelInvoice(id, body));
}
