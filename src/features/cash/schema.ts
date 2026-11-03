import { z } from "zod";
import { ExactDecimal } from "@/lib/money";
import { todayJakarta } from "@/lib/date";
import {
  businessDateSchema,
  recordId,
  revisionSchema,
  queryObject,
} from "@/lib/validation";
export const cashTypes = {
  INCOME: "Pemasukan",
  EXPENSE: "Pengeluaran",
} as const;
export const incomeKinds = { SALE: "Penjualan", OTHER: "Lain-lain" } as const;
export const wholeRupiah = z
  .string()
  .trim()
  .regex(/^\d{1,18}$/, "Isi Rupiah utuh, tidak negatif, maksimal 18 digit.");
const positiveAmount = wholeRupiah.refine(
  (value) => /^\d+$/.test(value) && new ExactDecimal(value).gt(0),
  "Jumlah harus lebih dari nol.",
);
const soldQuantity = z
  .string()
  .trim()
  .regex(
    /^\d{1,15}(?:[.,]\d{1,3})?$/,
    "Kuantitas tidak negatif, maksimal tiga desimal.",
  )
  .transform((v) => v.replace(",", "."));
export const cashSchema = z
  .object({
    transactionDate: businessDateSchema.default(todayJakarta),
    type: z.enum(["INCOME", "EXPENSE"], { error: "Pilih jenis transaksi." }),
    description: z
      .string()
      .trim()
      .min(1, "Keterangan wajib diisi.")
      .max(5000, "Maksimal 5.000 karakter."),
    amount: positiveAmount,
    expensePostId: recordId.nullable().default(null),
    incomeKind: z.enum(["SALE", "OTHER"]).nullable().default(null),
    categoryId: recordId.nullable().default(null),
    subcategoryId: recordId.nullable().default(null),
    orderId: recordId.nullable().default(null),
    soldQuantity: soldQuantity.nullable().default(null),
    soldUnit: z
      .string()
      .trim()
      .min(1, "Satuan wajib diisi bila kuantitas diketahui.")
      .max(30)
      .nullable()
      .default(null),
  })
  .strict()
  .superRefine((data, ctx) => {
    const issue = (field: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [field], message });
    if (data.type === "EXPENSE") {
      if (!data.expensePostId) issue("expensePostId", "Pilih pos pengeluaran.");
      if (
        [
          data.incomeKind,
          data.categoryId,
          data.subcategoryId,
          data.orderId,
          data.soldQuantity,
          data.soldUnit,
        ].some((v) => v !== null)
      )
        issue(
          "type",
          "Pengeluaran tidak boleh memiliki data penjualan/pemasukan.",
        );
    } else {
      if (data.expensePostId)
        issue("expensePostId", "Pemasukan tidak menggunakan pos pengeluaran.");
      if (!data.incomeKind)
        issue("incomeKind", "Pilih Penjualan atau Lain-lain.");
      if (
        data.incomeKind === "OTHER" &&
        [
          data.categoryId,
          data.subcategoryId,
          data.orderId,
          data.soldQuantity,
          data.soldUnit,
        ].some((v) => v !== null)
      )
        issue(
          "incomeKind",
          "Pemasukan lain-lain tidak menggunakan data penjualan.",
        );
      if (data.incomeKind === "SALE" && !data.categoryId)
        issue("categoryId", "Pilih kategori produk untuk penjualan.");
      if ((data.soldQuantity === null) !== (data.soldUnit === null))
        issue(
          "soldQuantity",
          "Isi kuantitas beserta satuan, atau kosongkan keduanya bila belum diketahui.",
        );
    }
  });
export type CashInput = z.infer<typeof cashSchema>;
export const createCashSchema = z
  .object({
    data: cashSchema,
    requestKey: z.uuid("Kunci permintaan tidak valid."),
  })
  .strict();
export const updateCashSchema = z
  .object({ data: cashSchema, updatedAt: revisionSchema })
  .strict();
export const removeCashSchema = z
  .object({ updatedAt: revisionSchema })
  .strict();
const optional = (schema: z.ZodString) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());
export const cashFilterSchema = z
  .object({
    q: z.string().trim().max(150).default(""),
    type: z.enum(["", "INCOME", "EXPENSE"]).default(""),
    expensePostId: optional(recordId),
    start: optional(businessDateSchema),
    end: optional(businessDateSchema),
    page: z.coerce.number().int().min(1).max(2147483647).default(1),
    pageSize: z.coerce
      .number()
      .pipe(
        z.union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)]),
      )
      .default(10),
  })
  .superRefine((data, ctx) => {
    if (data.start && data.end && data.start > data.end)
      ctx.addIssue({
        code: "custom",
        path: ["end"],
        message: "Tanggal akhir harus sama atau setelah tanggal mulai.",
      });
  });
export type CashFilters = z.infer<typeof cashFilterSchema>;
export const parseCashFilters = (
  input: URLSearchParams | Record<string, unknown>,
) => cashFilterSchema.parse(queryObject(input));
export function cashQuery(filters: CashFilters, page = filters.page) {
  const params = new URLSearchParams();
  for (const key of ["q", "type", "expensePostId", "start", "end"] as const)
    if (filters[key]) params.set(key, filters[key]!);
  params.set("page", String(page));
  params.set("pageSize", String(filters.pageSize));
  return params.toString();
}
export const openingSchema = z
  .object({
    openingDate: businessDateSchema,
    openingAmount: wholeRupiah,
    updatedAt: revisionSchema.nullable(),
    acknowledge: z.boolean().default(false),
  })
  .strict();
export const financePeriodSchema = z
  .object({ start: businessDateSchema, end: businessDateSchema })
  .superRefine((data, ctx) => {
    if (data.start > data.end)
      ctx.addIssue({
        code: "custom",
        path: ["end"],
        message: "Rentang tanggal terbalik.",
      });
  });
export type CashRow = {
  id: string;
  transactionDate: string;
  type: "INCOME" | "EXPENSE";
  description: string;
  amount: string;
  expensePostId: string | null;
  expensePostName: string | null;
  expenseGroupSnapshot: "PRODUCTION" | "OPERATIONAL" | "MARKETING" | null;
  incomeKind: "SALE" | "OTHER" | null;
  categoryId: string | null;
  subcategoryId: string | null;
  categoryNameSnapshot: string | null;
  productNameSnapshot: string | null;
  orderId: string | null;
  orderNumber: string | null;
  orderCustomerName: string | null;
  soldQuantity: string | null;
  soldUnit: string | null;
  updatedAt: string;
};
export type CashTotals = {
  income: string;
  expense: string;
  net: string;
  count: number;
  groups: { PRODUCTION: string; OPERATIONAL: string; MARKETING: string };
};
export type CashPage = {
  rows: CashRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  totals: CashTotals;
};
export type OpeningState = {
  openingDate: string;
  openingAmount: string;
  updatedAt: string;
} | null;
export type FinanceSummary = CashTotals & {
  start: string;
  end: string;
  openingDate: string | null;
  openingBalance: string | null;
  closingBalance: string | null;
  balanceStatus: "READY" | "NOT_CONFIGURED" | "BEFORE_OPENING";
};
