import { requirePageAdmin } from "@/lib/auth/session";
import { todayJakarta } from "@/lib/date";
import { getExpenseRows } from "@/features/expenses/service";
import { parseTradeFilters } from "@/features/trade/schema";
import { InvoiceForm } from "@/features/trade/invoice-form";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageAdmin();
  const { kind } = parseTradeFilters(await searchParams);
  return (
    <InvoiceForm
      kind={kind}
      today={todayJakarta()}
      posts={await getExpenseRows()}
    />
  );
}
