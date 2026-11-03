import { notFound } from "next/navigation";
import { requirePageAdmin } from "@/lib/auth/session";
import { AppError } from "@/lib/app-error";
import { getCategoryRows } from "@/features/categories/service";
import { getOrder } from "@/features/orders/service";
import { getBudget } from "@/features/budget/service";
import { BudgetForm } from "@/features/budget/budget-form";
export default async function EditBudgetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAdmin();
  const initial = await getBudget((await params).id).catch((error) => {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  });
  const [categories, initialOrder] = await Promise.all([
    getCategoryRows(),
    initial.orderId
      ? getOrder(initial.orderId).catch((error) => {
          if (error instanceof AppError && error.status === 404)
            return undefined;
          throw error;
        })
      : undefined,
  ]);
  return (
    <BudgetForm
      key={initial.updatedAt}
      initial={initial}
      initialOrder={initialOrder}
      categories={categories}
    />
  );
}
