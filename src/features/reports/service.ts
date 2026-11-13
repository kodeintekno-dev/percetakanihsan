import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { ExactDecimal } from "@/lib/money";
import { databaseDate, dateOnly } from "@/lib/date";
import { financialSummary } from "@/features/cash/aggregates";
import { AppError } from "@/lib/app-error";
import { serializeAsset } from "@/features/assets/service";
import { assetDepreciation } from "@/features/assets/depreciation";
import {
  reportPeriod,
  reportFilterSchema,
  expenseGroupNames,
  type ReportFilters,
  type ReportData,
  type IncomeReportRow,
  type ExpenseReportRow,
  type AnalyticPost,
  type DailyCashFlow,
} from "./schema";
const incomeKey = (row: {
  categoryId: string | null;
  subcategoryId: string | null;
  categoryNameSnapshot: string | null;
  productNameSnapshot: string | null;
}) =>
  JSON.stringify([
    row.categoryId,
    row.subcategoryId,
    row.categoryNameSnapshot,
    row.productNameSnapshot,
  ]);
export async function getReport(filters: ReportFilters): Promise<ReportData> {
  const period = reportPeriod(reportFilterSchema.parse(filters)),
    dates = { gte: databaseDate(period.start), lte: databaseDate(period.end) },
    active = { deletedAt: null, transactionDate: dates };
  return getDb().$transaction(
    async (tx) => {
      const finance = await financialSummary(tx, period.start, period.end);
      const fixedAssets = await tx.fixedAsset.findMany();
      const assetRows = fixedAssets.map((a) => ({
        id: a.id,
        name: a.name,
        ...assetDepreciation(serializeAsset(a), period.start, period.end),
      }));
      const depreciation = assetRows
        .reduce((s, a) => s.add(a.amount), new ExactDecimal(0))
        .toFixed(0);
      const acquisitions = await tx.cashTransaction.aggregate({
        where: { ...active, type: "EXPENSE", purchasedAsset: { isNot: null } },
        _sum: { amount: true },
      });
      const purchases = acquisitions._sum.amount?.toFixed(0) ?? "0";
      const assets = {
        rows: assetRows,
        depreciation,
        purchases,
        adjustedNet: new ExactDecimal(finance.net)
          .add(purchases)
          .sub(depreciation)
          .toFixed(0),
      };
      const [
        opening,
        orderCount,
        saleGroups,
        orderLinks,
        other,
        expenseGroups,
        dailyGroups,
      ] = await Promise.all([
        tx.cashOpeningSetting.findUnique({ where: { id: 1 } }),
        tx.printOrder.count({ where: { deletedAt: null, orderDate: dates } }),
        tx.cashTransaction.groupBy({
          by: [
            "categoryId",
            "subcategoryId",
            "categoryNameSnapshot",
            "productNameSnapshot",
            "soldUnit",
          ],
          where: { ...active, type: "INCOME", incomeKind: "SALE" },
          _sum: { amount: true, soldQuantity: true },
          _count: { _all: true, soldQuantity: true },
        }),
        tx.cashTransaction.findMany({
          where: {
            ...active,
            type: "INCOME",
            incomeKind: "SALE",
            orderId: { not: null },
          },
          distinct: [
            "categoryId",
            "subcategoryId",
            "categoryNameSnapshot",
            "productNameSnapshot",
            "orderId",
          ],
          select: {
            categoryId: true,
            subcategoryId: true,
            categoryNameSnapshot: true,
            productNameSnapshot: true,
            orderId: true,
          },
        }),
        tx.cashTransaction.aggregate({
          where: { ...active, type: "INCOME", incomeKind: "OTHER" },
          _sum: { amount: true },
          _count: true,
        }),
        tx.cashTransaction.groupBy({
          by: ["expensePostId", "expenseGroupSnapshot"],
          where: { ...active, type: "EXPENSE" },
          _sum: { amount: true },
          _count: true,
        }),
        tx.cashTransaction.groupBy({
          by: ["transactionDate", "type"],
          where: active,
          _sum: { amount: true },
          orderBy: { transactionDate: "asc" },
        }),
      ]);
      const categoryIds = [
        ...new Set(
          saleGroups.flatMap((g) =>
            [g.categoryId, g.subcategoryId].filter((v): v is string => !!v),
          ),
        ),
      ];
      const postIds = [
        ...new Set(
          expenseGroups
            .map((g) => g.expensePostId)
            .filter((v): v is string => !!v),
        ),
      ];
      const [categories, posts] = await Promise.all([
        tx.productCategory.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true },
        }),
        tx.expensePost.findMany({
          where: { id: { in: postIds } },
          select: { id: true, name: true },
        }),
      ]);
      const categoryNames = new Map(categories.map((c) => [c.id, c.name])),
        postNames = new Map(posts.map((p) => [p.id, p.name]));
      const links = new Map<string, Set<string>>(),
        allOrders = new Set<string>();
      for (const link of orderLinks) {
        if (!link.orderId) continue;
        const key = incomeKey(link);
        if (!links.has(key)) links.set(key, new Set());
        links.get(key)!.add(link.orderId);
        allOrders.add(link.orderId);
      }
      const saleRows = new Map<string, IncomeReportRow>();
      let legacyLabelCount = 0;
      for (const g of saleGroups) {
        if (!g.categoryId)
          throw new AppError(
            "Kategori penjualan belum lengkap. Periksa data kas sebelum membuat laporan.",
            503,
          );
        const key = incomeKey(g);
        let row = saleRows.get(key);
        if (!row) {
          row = {
            key,
            categoryId: g.categoryId,
            subcategoryId: g.subcategoryId,
            categoryName:
              g.categoryNameSnapshot ??
              categoryNames.get(g.categoryId) ??
              "Kategori tanpa label",
            productName:
              g.productNameSnapshot ??
              categoryNames.get(g.subcategoryId ?? g.categoryId) ??
              "Produk tanpa label",
            transactionCount: 0,
            linkedOrderCount: links.get(key)?.size ?? 0,
            amount: "0",
            quantities: [],
            knownQuantityCount: 0,
            unknownQuantityCount: 0,
          };
          saleRows.set(key, row);
        }
        row.transactionCount += g._count._all;
        row.knownQuantityCount += g._count.soldQuantity;
        row.unknownQuantityCount += g._count._all - g._count.soldQuantity;
        row.amount = new ExactDecimal(row.amount)
          .add(g._sum.amount?.toFixed(0) ?? 0)
          .toFixed(0);
        if (!g.categoryNameSnapshot || !g.productNameSnapshot)
          legacyLabelCount += g._count._all;
        if (g._count.soldQuantity) {
          const unit =
              g.soldUnit?.trim().toLocaleLowerCase("id-ID") || "tanpa satuan",
            existing = row.quantities.find((q) => q.unit === unit),
            qty = g._sum.soldQuantity?.toFixed(3) ?? "0.000";
          if (existing)
            existing.quantity = new ExactDecimal(existing.quantity)
              .add(qty)
              .toFixed(3);
          else row.quantities.push({ unit, quantity: qty });
        }
      }
      const sales = [...saleRows.values()].sort(
        (a, b) =>
          a.categoryName.localeCompare(b.categoryName, "id-ID") ||
          a.productName.localeCompare(b.productName, "id-ID") ||
          a.key.localeCompare(b.key),
      );
      for (const row of sales)
        row.quantities.sort((a, b) => a.unit.localeCompare(b.unit, "id-ID"));
      const expenses: ExpenseReportRow[] = expenseGroups
        .map((g) => {
          if (!g.expensePostId || !g.expenseGroupSnapshot)
            throw new AppError(
              "Pengelompokan pengeluaran belum lengkap. Periksa data kas.",
              503,
            );
          return {
            postId: g.expensePostId,
            postName: postNames.get(g.expensePostId) ?? "Pos tidak tersedia",
            group: g.expenseGroupSnapshot,
            transactionCount: g._count,
            amount: g._sum.amount?.toFixed(0) ?? "0",
          };
        })
        .sort(
          (a, b) =>
            Object.keys(expenseGroupNames).indexOf(a.group) -
              Object.keys(expenseGroupNames).indexOf(b.group) ||
            new ExactDecimal(b.amount).cmp(a.amount) ||
            a.postName.localeCompare(b.postName, "id-ID") ||
            a.postId.localeCompare(b.postId),
        );
      const analytics = new Map<string, AnalyticPost>();
      for (const e of expenses) {
        let post = analytics.get(e.postId);
        if (!post) {
          post = {
            postId: e.postId,
            postName: e.postName,
            groups: [],
            transactionCount: 0,
            amount: "0",
            percent: "0.00",
          };
          analytics.set(e.postId, post);
        }
        if (!post.groups.includes(e.group)) post.groups.push(e.group);
        post.transactionCount += e.transactionCount;
        post.amount = new ExactDecimal(post.amount).add(e.amount).toFixed(0);
      }
      const ranked = [...analytics.values()].sort(
        (a, b) =>
          new ExactDecimal(b.amount).cmp(a.amount) ||
          a.postName.localeCompare(b.postName, "id-ID") ||
          a.postId.localeCompare(b.postId),
      );
      for (const row of ranked) {
        row.groups.sort(
          (a, b) =>
            Object.keys(expenseGroupNames).indexOf(a) -
            Object.keys(expenseGroupNames).indexOf(b),
        );
        row.percent = new ExactDecimal(finance.expense).isZero()
          ? "0.00"
          : new ExactDecimal(row.amount)
              .div(finance.expense)
              .mul(100)
              .toFixed(2);
      }
      const byDay = new Map<string, { income: string; expense: string }>();
      for (const g of dailyGroups) {
        const date = dateOnly(g.transactionDate);
        if (!byDay.has(date)) byDay.set(date, { income: "0", expense: "0" });
        const day = byDay.get(date)!;
        day[g.type === "INCOME" ? "income" : "expense"] =
          g._sum.amount?.toFixed(0) ?? "0";
      }
      let running =
        finance.openingBalance === null
          ? null
          : new ExactDecimal(finance.openingBalance);
      const daily: DailyCashFlow[] = [...byDay]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, day]) => {
          const net = new ExactDecimal(day.income).sub(day.expense).toFixed(0),
            begin = running?.toFixed(0) ?? null;
          if (running) running = running.add(net);
          return {
            date,
            ...day,
            net,
            openingBalance: begin,
            closingBalance: running?.toFixed(0) ?? null,
          };
        });
      const saleAmount = sales
          .reduce((sum, row) => sum.add(row.amount), new ExactDecimal(0))
          .toFixed(0),
        otherAmount = other._sum.amount?.toFixed(0) ?? "0";
      if (
        !new ExactDecimal(saleAmount).add(otherAmount).eq(finance.income) ||
        !expenses
          .reduce((sum, row) => sum.add(row.amount), new ExactDecimal(0))
          .eq(finance.expense)
      )
        throw new AppError(
          "Rincian belum cocok dengan total kas. Periksa integritas data sebelum mengekspor.",
          503,
        );
      const result = {
        assets,
        period,
        finance,
        opening: opening?.isConfigured
          ? {
              date: dateOnly(opening.openingDate),
              amount: opening.openingAmount.toFixed(0),
            }
          : null,
        orderCount,
        income: {
          sales,
          saleAmount,
          saleTransactionCount: sales.reduce(
            (n, row) => n + row.transactionCount,
            0,
          ),
          linkedOrderCount: allOrders.size,
          otherAmount,
          otherTransactionCount: other._count,
          legacyLabelCount,
        },
        expenses,
        posts: ranked,
        daily,
      };
      return {
        ...result,
        revision: createHash("sha256")
          .update(JSON.stringify(result))
          .digest("hex"),
        generatedAt: new Date().toISOString(),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
