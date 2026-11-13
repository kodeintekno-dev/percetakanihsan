import { z } from "zod";
import { ExactDecimal } from "@/lib/money";
import {
  businessDateSchema,
  recordId,
  revisionSchema,
  queryObject,
} from "@/lib/validation";

export const tradeKinds = {
  RECEIVABLE: "Piutang Pelanggan",
  PAYABLE: "Hutang Pemasok",
} as const;
export const tradeStatuses = {
  OPEN: "Belum dibayar",
  PARTIAL: "Dibayar sebagian",
  PAID: "Lunas",
  OVERDUE: "Lewat jatuh tempo",
  CANCELLED: "Dibatalkan",
} as const;
const amount = z
  .string()
  .trim()
  .regex(/^\d{1,18}$/, "Isi Rupiah utuh, maksimal 18 digit.")
  .refine(
    (v) => /^\d+$/.test(v) && new ExactDecimal(v).gt(0),
    "Nominal harus lebih dari nol.",
  )
  .transform((v) => new ExactDecimal(v).toFixed(0));
const notes = z.string().trim().max(2000).default("");
const fields = {
  reference: z.string().trim().min(1, "Nomor tagihan wajib diisi.").max(100),
  partyName: z.string().trim().max(200).default(""),
  issueDate: businessDateSchema,
  dueDate: businessDateSchema,
  amount,
  notes,
};
const dates = (
  data: { issueDate: string; dueDate: string },
  ctx: z.RefinementCtx,
) => {
  if (data.dueDate < data.issueDate)
    ctx.addIssue({
      code: "custom",
      path: ["dueDate"],
      message: "Jatuh tempo tidak boleh sebelum tanggal tagihan.",
    });
};
export const invoiceSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(["RECEIVABLE", "PAYABLE"]),
    ...fields,
    orderId: recordId.nullable().default(null),
    expensePostId: recordId.nullable().default(null),
  })
  .strict()
  .superRefine((v, ctx) => {
    dates(v, ctx);
    if (v.kind === "RECEIVABLE" && (!v.orderId || v.expensePostId))
      ctx.addIssue({
        code: "custom",
        path: ["orderId"],
        message:
          "Piutang wajib terhubung ke pesanan dan tidak memakai pos pengeluaran.",
      });
    if (v.kind === "PAYABLE" && (!v.partyName || !v.expensePostId))
      ctx.addIssue({
        code: "custom",
        path: ["partyName"],
        message: "Isi nama pemasok dan pilih pos pengeluaran.",
      });
  });
export const invoiceEditSchema = z
  .object({ ...fields, updatedAt: revisionSchema })
  .strict()
  .superRefine(dates);
export const reasonSchema = z
  .object({
    updatedAt: revisionSchema,
    reason: z.string().trim().min(1, "Alasan wajib diisi.").max(500),
  })
  .strict();
export const paymentSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("NEW"),
      id: z.uuid(),
      updatedAt: revisionSchema,
      transactionDate: businessDateSchema,
      amount,
      notes,
    })
    .strict(),
  z
    .object({
      mode: z.literal("LINK"),
      id: z.uuid(),
      updatedAt: revisionSchema,
      cashId: recordId,
      notes,
    })
    .strict(),
]);
export const tradeFilterSchema = z
  .object({
    kind: z.enum(["RECEIVABLE", "PAYABLE"]).default("RECEIVABLE"),
    q: z.string().trim().max(150).default(""),
    status: z
      .enum(["", "OPEN", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"])
      .default(""),
    page: z.coerce.number().int().min(1).max(2147483647).default(1),
  })
  .strict();
export const parseTradeFilters = (
  v: URLSearchParams | Record<string, unknown>,
) => tradeFilterSchema.parse(queryObject(v));
export type TradeFilters = z.infer<typeof tradeFilterSchema>;
export type TradeKind = keyof typeof tradeKinds;
export type InvoiceRow = {
  id: string;
  kind: TradeKind;
  reference: string;
  partyName: string;
  issueDate: string;
  dueDate: string;
  amount: string;
  paidAmount: string;
  remaining: string;
  status: "OPEN" | "PARTIAL" | "PAID" | "CANCELLED";
  overdue: boolean;
  orderId: string | null;
  orderNumber: string | null;
  expensePostId: string | null;
  expensePostName: string | null;
  notes: string;
  updatedAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
};
export type PaymentRow = {
  id: string;
  cashId: string;
  amount: string;
  transactionDate: string;
  description: string;
  createdCash: boolean;
  notes: string;
  voidedAt: string | null;
  voidReason: string | null;
};
export type InvoiceDetail = InvoiceRow & { payments: PaymentRow[] };
export type InvoicePage = {
  rows: InvoiceRow[];
  page: number;
  totalPages: number;
  total: number;
  summary: {
    remaining: string;
    overdue: string;
    dueSoon: string;
    openCount: number;
  };
  today: string;
};
export type CashCandidate = {
  id: string;
  amount: string;
  transactionDate: string;
  description: string;
};
