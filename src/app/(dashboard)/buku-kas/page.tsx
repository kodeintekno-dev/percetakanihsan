import Link from "next/link";
import { ZodError } from "zod";
import { requirePageAdmin } from "@/lib/auth/session";
import { AppError } from "@/lib/app-error";
import { PageHeading } from "@/components/page-heading";
import { getExpenseRows } from "@/features/expenses/service";
import { parseCashFilters, cashQuery } from "@/features/cash/schema";
import { listCash } from "@/features/cash/service";
import { CashList } from "@/features/cash/cash-list";
export default async function CashPage({
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
          title="Buku Kas"
          description="Periksa kembali filter buku kas."
        />
        <div className="alert error" role="alert">
          {result.error}
        </div>
        <Link className="button secondary" href="/buku-kas">
          Reset filter
        </Link>
      </>
    );
  return (
    <CashList
      key={cashQuery(result.filters)}
      data={result.data}
      posts={result.posts}
      filters={result.filters}
      notice={typeof query.notice === "string" ? query.notice : undefined}
    />
  );
}
async function load(query: Record<string, string | string[] | undefined>) {
  try {
    const filters = parseCashFilters(query);
    const [data, posts] = await Promise.all([
      listCash(filters),
      getExpenseRows(),
    ]);
    return { filters, data, posts };
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
