import Link from "next/link";
import { ZodError } from "zod";
import { requirePageAdmin } from "@/lib/auth/session";
import { AppError } from "@/lib/app-error";
import { getCategoryRows } from "@/features/categories/service";
import { parseOrderFilters, orderQuery } from "@/features/orders/schema";
import { listOrders } from "@/features/orders/service";
import { OrderList } from "@/features/orders/order-list";
import { PageHeading } from "@/components/page-heading";
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageAdmin();
  const query = await searchParams;
  const result = await loadOrders(query);
  if ("error" in result)
    return (
      <>
        <PageHeading
          title="Permintaan Cetak"
          description="Periksa kembali filter permintaan."
        />
        <div className="alert error" role="alert">
          {result.error}
        </div>
        <Link href="/permintaan" className="button secondary">
          Reset filter
        </Link>
      </>
    );
  return (
    <OrderList
      key={orderQuery(result.filters)}
      data={result.data}
      categories={result.categories}
      filters={result.filters}
      notice={typeof query.notice === "string" ? query.notice : undefined}
    />
  );
}
async function loadOrders(
  query: Record<string, string | string[] | undefined>,
) {
  try {
    const filters = parseOrderFilters(query);
    const [data, categories] = await Promise.all([
      listOrders(filters),
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
