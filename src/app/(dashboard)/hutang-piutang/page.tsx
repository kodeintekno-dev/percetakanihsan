import { Suspense } from "react";
import { requirePageAdmin } from "@/lib/auth/session";
import {
  parseTradeFilters,
  tradeKinds,
  type TradeFilters,
} from "@/features/trade/schema";
import { listInvoices } from "@/features/trade/service";
import { TradeList } from "@/features/trade/trade-list";
import { TradeListShell } from "@/features/trade/trade-list-shell";
import { TradeListLoading } from "@/features/trade/trade-list-loading";
import "@/features/trade/trade.css";

async function InvoiceResults({ filters }: { filters: TradeFilters }) {
  return <TradeList filters={filters} data={await listInvoices(filters)} />;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageAdmin();
  const filters = parseTradeFilters(await searchParams);
  return (
    <TradeListShell kind={filters.kind} kinds={tradeKinds}>
      <Suspense
        key={JSON.stringify(filters)}
        fallback={<TradeListLoading kind={filters.kind} />}
      >
        <InvoiceResults filters={filters} />
      </Suspense>
    </TradeListShell>
  );
}
