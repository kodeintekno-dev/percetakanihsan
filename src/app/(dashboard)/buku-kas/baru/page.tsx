import { requirePageAdmin } from "@/lib/auth/session";
import { getCategoryRows } from "@/features/categories/service";
import { getExpenseRows } from "@/features/expenses/service";
import { getOpeningSettings } from "@/features/cash/service";
import { CashForm } from "@/features/cash/cash-form";
import { todayJakarta } from "@/lib/date";
export default async function NewCashPage() {
  await requirePageAdmin();
  const [categories, posts, config] = await Promise.all([
    getCategoryRows(),
    getExpenseRows(),
    getOpeningSettings(),
  ]);
  return (
    <CashForm
      categories={categories}
      posts={posts}
      today={todayJakarta()}
      openingDate={config.opening?.openingDate ?? null}
    />
  );
}
