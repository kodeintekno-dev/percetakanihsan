import { z } from "zod";
import { ExactDecimal, MAX_RUPIAH, orderTotal } from "@/lib/money";
import { todayJakarta, validBusinessDate } from "@/lib/date";
export const orderStatuses = {
  NEW: "Baru",
  IN_PROGRESS: "Diproses",
  COMPLETED: "Selesai",
  PICKED_UP: "Diambil",
} as const;
export type OrderStatus = keyof typeof orderStatuses;
export const statusSchema = z.enum(
  ["NEW", "IN_PROGRESS", "COMPLETED", "PICKED_UP"],
  { error: "Pilih status pekerjaan yang valid." },
);
const id = z.string().min(1, "Pilih kategori.").max(100);
const businessDate = z
  .string()
  .refine(validBusinessDate, "Tanggal tidak valid.");
const quantitySchema = z
  .string()
  .trim()
  .regex(
    /^\d{1,15}(?:[.,]\d{1,3})?$/,
    "Jumlah harus angka positif, maksimal 3 desimal dan 15 digit sebelum desimal.",
  )
  .transform((v) => v.replace(",", "."))
  .refine((v) => new ExactDecimal(v).gt(0), "Jumlah harus lebih dari nol.");
const priceSchema = z
  .string()
  .trim()
  .regex(
    /^\d{1,18}$/,
    "Harga satuan harus Rupiah utuh, tidak negatif, maksimal 18 digit.",
  );
export const orderSchema = z
  .object({
    orderDate: businessDate.default(todayJakarta),
    customerName: z
      .string()
      .trim()
      .min(1, "Nama pelanggan wajib diisi.")
      .max(150, "Maksimal 150 karakter."),
    categoryId: id,
    subcategoryId: id.nullable(),
    quantity: quantitySchema,
    unit: z
      .string()
      .trim()
      .min(1, "Satuan wajib diisi.")
      .max(30, "Maksimal 30 karakter."),
    unitPrice: priceSchema,
    status: statusSchema.default("NEW"),
    notes: z.string().max(5000, "Catatan maksimal 5.000 karakter.").default(""),
  })
  .strict()
  .superRefine((data, context) => {
    // Jika format angka gagal, jangan meneruskan nilai invalid ke Decimal.
    if (
      !/^\d+(?:\.\d{1,3})?$/.test(data.quantity) ||
      !/^\d+$/.test(data.unitPrice)
    )
      return;
    if (
      new ExactDecimal(orderTotal(data.quantity, data.unitPrice)).gt(MAX_RUPIAH)
    )
      context.addIssue({
        code: "custom",
        path: ["quantity"],
        message:
          "Total melebihi kapasitas Rupiah (18 digit). Kurangi jumlah atau harga.",
      });
  });
export const revisionSchema = z
  .string()
  .datetime({
    offset: true,
    error: "Versi data tidak valid. Muat ulang halaman.",
  });
export const updateOrderSchema = z
  .object({ data: orderSchema, updatedAt: revisionSchema })
  .strict();
export const statusUpdateSchema = z
  .object({ status: statusSchema, updatedAt: revisionSchema })
  .strict();
export const deleteOrderSchema = z
  .object({ updatedAt: revisionSchema })
  .strict();
const emptyOptional = (schema: z.ZodString) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());
export const filterSchema = z
  .object({
    q: z.string().trim().max(150).default(""),
    status: z.union([statusSchema, z.literal("")]).default(""),
    categoryId: emptyOptional(id),
    subcategoryId: emptyOptional(id),
    start: emptyOptional(businessDate),
    end: emptyOptional(businessDate),
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
    if (data.subcategoryId && !data.categoryId)
      ctx.addIssue({
        code: "custom",
        path: ["subcategoryId"],
        message: "Pilih kategori utama untuk subkategori ini.",
      });
  });
export type OrderFilters = z.infer<typeof filterSchema>;
export function parseOrderFilters(
  input: URLSearchParams | Record<string, string | string[] | undefined>,
) {
  if (!(input instanceof URLSearchParams)) return filterSchema.parse(input);
  const values: Record<string, string | string[]> = {};
  for (const key of new Set(input.keys())) {
    const entries = input.getAll(key);
    values[key] = entries.length === 1 ? entries[0] : entries;
  }
  return filterSchema.parse(values);
}
export function orderQuery(filters: OrderFilters, page = filters.page) {
  const query = new URLSearchParams();
  for (const key of [
    "q",
    "status",
    "categoryId",
    "subcategoryId",
    "start",
    "end",
  ] as const)
    if (filters[key]) query.set(key, filters[key]!);
  query.set("page", String(page));
  query.set("pageSize", String(filters.pageSize));
  return query.toString();
}
export type OrderRow = {
  id: string;
  orderNumber: string;
  orderDate: string;
  customerName: string;
  categoryId: string;
  subcategoryId: string | null;
  categoryNameSnapshot: string;
  productNameSnapshot: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  totalPrice: string;
  status: OrderStatus;
  notes: string;
  updatedAt: string;
  incomeCount: number;
  budgetCount: number;
};
export type OrderPage = {
  rows: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
