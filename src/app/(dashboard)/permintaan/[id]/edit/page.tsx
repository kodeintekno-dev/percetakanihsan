import { notFound } from "next/navigation";
import { requirePageAdmin } from "@/lib/auth/session";
import { getCategoryRows } from "@/features/categories/service";
import { getOrder } from "@/features/orders/service";
import { todayJakarta } from "@/lib/date";
import { AppError } from "@/lib/app-error";
import { OrderForm } from "@/features/orders/order-form";
export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAdmin();
  const [initial, categories] = await Promise.all([
    getOrder((await params).id).catch((error) => {
      if (error instanceof AppError && error.status === 404) notFound();
      throw error;
    }),
    getCategoryRows(),
  ]);
  return (
    <OrderForm
      initial={initial}
      categories={categories}
      today={todayJakarta()}
    />
  );
}
