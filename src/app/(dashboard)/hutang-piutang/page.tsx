import { requirePageAdmin } from "@/lib/auth/session";
import { parseTradeFilters } from "@/features/trade/schema";
import { listInvoices } from "@/features/trade/service";
import { TradeList } from "@/features/trade/trade-list";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageAdmin();
  const filters = parseTradeFilters(await searchParams);
  return <TradeList filters={filters} data={await listInvoices(filters)} />;
}
