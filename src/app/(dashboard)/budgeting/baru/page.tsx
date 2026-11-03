import { requirePageAdmin } from "@/lib/auth/session";
import { getCategoryRows } from "@/features/categories/service";
import { BudgetForm } from "@/features/budget/budget-form";
export default async function NewBudgetPage() {
  await requirePageAdmin();
  return <BudgetForm categories={await getCategoryRows()} />;
}
