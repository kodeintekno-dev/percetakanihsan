import { listInvoices, createInvoice } from "@/features/trade/service";
import { parseTradeFilters } from "@/features/trade/schema";
import { tradeRead, tradeWrite } from "@/features/trade/http";
export async function GET(request: Request) {
  return tradeRead(() =>
    listInvoices(parseTradeFilters(new URL(request.url).searchParams)),
  );
}
export async function POST(request: Request) {
  return tradeWrite(request, createInvoice, 201);
}
