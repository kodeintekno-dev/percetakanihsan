import { z } from "zod";
import { businessDateSchema, queryObject } from "@/lib/validation";
import {
  todayJakarta,
  monthRange,
  displayDate,
  databaseDate,
} from "@/lib/date";
import type { FinanceSummary } from "@/features/cash/schema";
export const expenseGroupNames = {
  PRODUCTION: "Produksi",
  OPERATIONAL: "Operasional",
  MARKETING: "Marketing",
} as const;
export type ExpenseGroupKey = keyof typeof expenseGroupNames;
const monthly = z
  .object({
    mode: z.literal("month"),
    month: z.coerce
      .number()
      .int()
      .min(1, "Pilih bulan 1–12.")
      .max(12, "Pilih bulan 1–12."),
    year: z.coerce
      .number()
      .int()
      .min(1, "Tahun harus 1–9999.")
      .max(9999, "Tahun harus 1–9999."),
  })
  .strict();
const range = z
  .object({
    mode: z.literal("range"),
    start: businessDateSchema,
    end: businessDateSchema,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.start > v.end)
      ctx.addIssue({
        code: "custom",
        path: ["end"],
        message: "Tanggal akhir harus sama atau setelah tanggal mulai.",
      });
  });
export const reportFilterSchema = z.discriminatedUnion("mode", [
  monthly,
  range,
]);
export type ReportFilters = z.infer<typeof reportFilterSchema>;
export type ReportPeriod = {
  filters: ReportFilters;
  start: string;
  end: string;
  label: string;
};
export function parseReportFilters(
  input: URLSearchParams | Record<string, unknown>,
  now = new Date(),
): ReportFilters {
  const values = { ...queryObject(input) },
    today = todayJakarta(now);
  if (values.mode === undefined) {
    if ("start" in values || "end" in values) values.mode = "range";
    else values.mode = "month";
  }
  if (values.mode === "month") {
    values.month ??= Number(today.slice(5, 7));
    values.year ??= Number(today.slice(0, 4));
  }
  return reportFilterSchema.parse(values);
}
export function reportPeriod(filters: ReportFilters): ReportPeriod {
  if (filters.mode === "range")
    return {
      filters,
      start: filters.start,
      end: filters.end,
      label: `${displayDate(filters.start)} – ${displayDate(filters.end)}`,
    };
  const dates = monthRange(filters.year, filters.month);
  return {
    filters,
    ...dates,
    label: new Intl.DateTimeFormat("id-ID", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(databaseDate(dates.start)),
  };
}
export function reportQuery(filters: ReportFilters) {
  return new URLSearchParams(
    filters.mode === "month"
      ? {
          mode: filters.mode,
          year: String(filters.year),
          month: String(filters.month),
        }
      : { mode: filters.mode, start: filters.start, end: filters.end },
  ).toString();
}
export const reportRevisionSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Revisi laporan tidak valid.");
export type IncomeReportRow = {
  key: string;
  categoryId: string;
  subcategoryId: string | null;
  categoryName: string;
  productName: string;
  transactionCount: number;
  linkedOrderCount: number;
  amount: string;
  quantities: { unit: string; quantity: string }[];
  knownQuantityCount: number;
  unknownQuantityCount: number;
};
export type ExpenseReportRow = {
  postId: string;
  postName: string;
  group: ExpenseGroupKey;
  transactionCount: number;
  amount: string;
};
export type AnalyticPost = {
  postId: string;
  postName: string;
  groups: ExpenseGroupKey[];
  transactionCount: number;
  amount: string;
  percent: string;
};
export type DailyCashFlow = {
  date: string;
  income: string;
  expense: string;
  net: string;
  openingBalance: string | null;
  closingBalance: string | null;
};
export type ReportData = {
  assets: {
    rows: {
      id: string;
      name: string;
      amount: string;
      accumulated: string;
      bookValue: string;
    }[];
    depreciation: string;
    purchases: string;
    adjustedNet: string;
  };
  period: ReportPeriod;
  finance: FinanceSummary;
  opening: { date: string; amount: string } | null;
  orderCount: number;
  income: {
    sales: IncomeReportRow[];
    saleAmount: string;
    saleTransactionCount: number;
    linkedOrderCount: number;
    otherAmount: string;
    otherTransactionCount: number;
    legacyLabelCount: number;
  };
  expenses: ExpenseReportRow[];
  posts: AnalyticPost[];
  daily: DailyCashFlow[];
  revision: string;
  generatedAt: string;
};
