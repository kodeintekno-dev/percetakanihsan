import type { Prisma } from "@/generated/prisma/client";
import { databaseDate } from "@/lib/date";
import type { OrderFilters } from "./schema";
export function orderWhere(filters: OrderFilters): Prisma.PrintOrderWhereInput {
  // contains PostgreSQL memakai ILIKE; kata pencarian harus literal, bukan pola wildcard.
  const term = filters.q
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  return {
    deletedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.subcategoryId ? { subcategoryId: filters.subcategoryId } : {}),
    ...(filters.start || filters.end
      ? {
          orderDate: {
            ...(filters.start ? { gte: databaseDate(filters.start) } : {}),
            ...(filters.end ? { lte: databaseDate(filters.end) } : {}),
          },
        }
      : {}),
    ...(filters.q
      ? {
          OR: [
            { customerName: { contains: term, mode: "insensitive" } },
            {
              categoryNameSnapshot: {
                contains: term,
                mode: "insensitive",
              },
            },
            {
              productNameSnapshot: { contains: term, mode: "insensitive" },
            },
            {
              category: { name: { contains: term, mode: "insensitive" } },
            },
            {
              subcategory: {
                name: { contains: term, mode: "insensitive" },
              },
            },
            { orderNumber: { contains: term, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}
