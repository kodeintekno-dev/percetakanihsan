import { requirePageAdmin } from "@/lib/auth/session";
import { todayJakarta } from "@/lib/date";
import { getInvoice } from "@/features/trade/service";
import { InvoiceForm } from "@/features/trade/invoice-form";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/app-error";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAdmin();
  const { id } = await params;
  const initial = await getInvoice(id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  if (initial.cancelledAt) notFound();
  return (
    <InvoiceForm
      key={initial.updatedAt}
      initial={initial}
      kind={initial.kind}
      today={todayJakarta()}
      posts={[]}
    />
  );
}
