import Link from "next/link";
import { ZodError } from "zod";
import { requirePageAdmin } from "@/lib/auth/session";
import { AppError } from "@/lib/app-error";
import { PageHeading } from "@/components/page-heading";
import { getCategoryRows } from "@/features/categories/service";
import { listBudgets } from "@/features/budget/service";
import { parseBudgetFilters, budgetQuery } from "@/features/budget/schema";
import { BudgetList } from "@/features/budget/budget-list";
export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageAdmin();
  const query = await searchParams,
    result = await load(query);
  if ("error" in result)
    return (
      <>
        <PageHeading
          title="Budgeting HPP"
          description="Periksa kembali filter riwayat estimasi."
        />
        <div className="alert error" role="alert">
          {result.error}
        </div>
        <Link className="button secondary" href="/budgeting">
          Reset filter
        </Link>
      </>
    );
  return (
    <BudgetList
      key={budgetQuery(result.filters)}
      data={result.data}
      categories={result.categories}
      filters={result.filters}
      notice={typeof query.notice === "string" ? query.notice : undefined}
    />
  );
}
async function load(query: Record<string, string | string[] | undefined>) {
  try {
    const filters = parseBudgetFilters(query),
      [data, categories] = await Promise.all([
        listBudgets(filters),
        getCategoryRows(),
      ]);
    return { filters, data, categories };
  } catch (error) {
    if (
      !(error instanceof ZodError) &&
      !(error instanceof AppError && error.status === 422)
    )
      throw error;
    return {
      error:
        error instanceof ZodError
          ? error.issues.map((i) => i.message).join(" ")
          : error.message,
    };
  }
}
