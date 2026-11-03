import { notFound } from "next/navigation";
import { requirePageAdmin } from "@/lib/auth/session";
import { AppError } from "@/lib/app-error";
import { getCash, getOpeningSettings } from "@/features/cash/service";
import { getOrder } from "@/features/orders/service";
import { getCategoryRows } from "@/features/categories/service";
import { getExpenseRows } from "@/features/expenses/service";
import { CashForm } from "@/features/cash/cash-form";
import { todayJakarta } from "@/lib/date";
export default async function EditCashPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAdmin();
  const initial = await getCash((await params).id).catch((error) => {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  });
  const [categories, posts, config, initialOrder] = await Promise.all([
    getCategoryRows(),
    getExpenseRows(),
    getOpeningSettings(),
    initial.orderId ? getOrder(initial.orderId) : undefined,
  ]);
  return (
    <CashForm
      key={initial.id}
      initial={initial}
      initialOrder={initialOrder}
      categories={categories}
      posts={posts}
      openingDate={config.opening?.openingDate ?? null}
      today={todayJakarta()}
    />
  );
}
