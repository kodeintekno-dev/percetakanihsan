import type { Prisma } from "@/generated/prisma/client";
import type { BudgetFilters } from "./schema";
export function budgetWhere(
  filters: BudgetFilters,
): Prisma.BudgetEstimateWhereInput {
  const term = filters.q
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  const afterEnd = filters.end
    ? new Date(new Date(`${filters.end}T00:00:00+07:00`).getTime() + 86400000)
    : null;
  return {
    deletedAt: null,
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.subcategoryId ? { subcategoryId: filters.subcategoryId } : {}),
    ...(filters.start || afterEnd
      ? {
          createdAt: {
            ...(filters.start
              ? { gte: new Date(`${filters.start}T00:00:00+07:00`) }
              : {}),
            ...(afterEnd ? { lt: afterEnd } : {}),
          },
        }
      : {}),
    ...(term
      ? {
          OR: [
            { title: { contains: term, mode: "insensitive" } },
            { budgetNumber: { contains: term, mode: "insensitive" } },
            { customerNameSnapshot: { contains: term, mode: "insensitive" } },
            { orderNumberSnapshot: { contains: term, mode: "insensitive" } },
            { categoryNameSnapshot: { contains: term, mode: "insensitive" } },
            { productNameSnapshot: { contains: term, mode: "insensitive" } },
            { category: { name: { contains: term, mode: "insensitive" } } },
            { subcategory: { name: { contains: term, mode: "insensitive" } } },
            {
              order: { customerName: { contains: term, mode: "insensitive" } },
            },
          ],
        }
      : {}),
  };
}
