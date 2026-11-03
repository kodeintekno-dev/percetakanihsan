import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { ExactDecimal } from "@/lib/money";
import { currentMonthJakarta, databaseDate, dateOnly } from "@/lib/date";
import {
  financePeriodSchema,
  type CashTotals,
  type FinanceSummary,
} from "./schema";

export async function cashTotals(
  tx: Prisma.TransactionClient,
  where: Prisma.CashTransactionWhereInput,
): Promise<CashTotals> {
  const groups = await tx.cashTransaction.groupBy({
    by: ["type", "expenseGroupSnapshot"],
    where: { AND: [where, { deletedAt: null }] },
    _sum: { amount: true },
    _count: true,
  });
  let income = new ExactDecimal(0),
    expense = new ExactDecimal(0),
    count = 0;
  const result = { PRODUCTION: "0", OPERATIONAL: "0", MARKETING: "0" };
  for (const group of groups) {
    const amount = new ExactDecimal(group._sum.amount?.toFixed(0) ?? "0");
    count += group._count;
    if (group.type === "INCOME") income = income.add(amount);
    else {
      expense = expense.add(amount);
      if (group.expenseGroupSnapshot)
        result[group.expenseGroupSnapshot] = new ExactDecimal(
          result[group.expenseGroupSnapshot],
        )
          .add(amount)
          .toFixed(0);
    }
  }
  return {
    income: income.toFixed(0),
    expense: expense.toFixed(0),
    net: income.sub(expense).toFixed(0),
    count,
    groups: result,
  };
}

export async function financialSummary(
  tx: Prisma.TransactionClient,
  start: string,
  end: string,
): Promise<FinanceSummary> {
  financePeriodSchema.parse({ start, end });
  const totals = await cashTotals(tx, {
    transactionDate: { gte: databaseDate(start), lte: databaseDate(end) },
  });
  const opening = await tx.cashOpeningSetting.findUnique({ where: { id: 1 } });
  const base = {
    ...totals,
    start,
    end,
    openingDate: opening?.isConfigured ? dateOnly(opening.openingDate) : null,
    openingBalance: null,
    closingBalance: null,
  };
  if (!opening?.isConfigured)
    return { ...base, balanceStatus: "NOT_CONFIGURED" };
  if (start < dateOnly(opening.openingDate))
    return { ...base, balanceStatus: "BEFORE_OPENING" };
  const previous = await cashTotals(tx, {
    transactionDate: { gte: opening.openingDate, lt: databaseDate(start) },
  });
  const openingBalance = new ExactDecimal(opening.openingAmount.toFixed(0)).add(
    previous.net,
  );
  return {
    ...base,
    balanceStatus: "READY",
    openingBalance: openingBalance.toFixed(0),
    closingBalance: openingBalance.add(totals.net).toFixed(0),
  };
}

export async function getFinancialSummary(start: string, end: string) {
  return getDb().$transaction((tx) => financialSummary(tx, start, end), {
    isolationLevel: "RepeatableRead",
  });
}
export async function getDashboard(now = new Date()) {
  const period = currentMonthJakarta(now);
  return getDb().$transaction(
    async (tx) => {
      const finance = await financialSummary(tx, period.start, period.end);
      const orderCount = await tx.printOrder.count({
        where: {
          deletedAt: null,
          orderDate: {
            gte: databaseDate(period.start),
            lte: databaseDate(period.end),
          },
        },
      });
      const processingCount = await tx.printOrder.count({
        where: { deletedAt: null, status: "IN_PROGRESS" },
      });
      return {
        period,
        finance,
        orderCount,
        processingCount,
        generatedAt: new Date().toISOString(),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
