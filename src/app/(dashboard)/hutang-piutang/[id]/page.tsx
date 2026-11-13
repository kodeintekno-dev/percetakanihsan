import { requirePageAdmin } from "@/lib/auth/session";
import { todayJakarta } from "@/lib/date";
import { getInvoice } from "@/features/trade/service";
import { InvoiceDetail } from "@/features/trade/invoice-detail";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/app-error";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAdmin();
  const { id } = await params;
  const invoice = await getInvoice(id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  return <InvoiceDetail invoice={invoice} today={todayJakarta()} />;
}
