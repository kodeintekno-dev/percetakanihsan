import type { Prisma } from "@/generated/prisma/client";
import { databaseDate } from "@/lib/date";
import type { CashFilters } from "./schema";
export function cashWhere(
  filters: CashFilters,
): Prisma.CashTransactionWhereInput {
  const q = filters.q
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  return {
    deletedAt: null,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.expensePostId ? { expensePostId: filters.expensePostId } : {}),
    ...(q ? { description: { contains: q, mode: "insensitive" } } : {}),
    ...(filters.start || filters.end
      ? {
          transactionDate: {
            ...(filters.start ? { gte: databaseDate(filters.start) } : {}),
            ...(filters.end ? { lte: databaseDate(filters.end) } : {}),
          },
        }
      : {}),
  };
}
