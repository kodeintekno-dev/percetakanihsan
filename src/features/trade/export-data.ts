import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { databaseDate, dateOnly, todayJakarta } from "@/lib/date";
import { ExactDecimal } from "@/lib/money";
import { invoiceState } from "./calculation";
import { invoiceWhere, serializeInvoice } from "./service";
import type { InvoiceRow, PaymentRow, TradeFilters, TradeKind } from "./schema";
export type ExportPayment = PaymentRow & {
  invoiceId: string;
  reference: string;
  kind: TradeKind;
  partyName: string;
  orderNumber: string | null;
};
export type TradeExportData = {
  invoices: InvoiceRow[];
  payments: ExportPayment[];
  basis: string;
  generatedAt?: string;
};
type StoredPayment = Prisma.TradePaymentGetPayload<{
  include: {
    cash: true;
    invoice: { include: { expensePost: { select: { name: true } } } };
  };
}>;
function paymentRow(p: StoredPayment): ExportPayment {
  return {
    id: p.id,
    invoiceId: p.invoiceId,
    reference: p.invoice.reference,
    kind: p.invoice.kind,
    partyName: p.invoice.partyName,
    orderNumber: p.invoice.orderNumberSnapshot,
    cashId: p.cashId,
    amount: p.amount.toFixed(0),
    transactionDate: dateOnly(p.cash.transactionDate),
    description: p.cash.description,
    createdCash: p.createdCash,
    notes: p.notes,
    voidedAt: p.voidedAt?.toISOString() ?? null,
    voidReason: p.voidReason,
  };
}
const paymentInclude = {
  cash: true,
  invoice: { include: { expensePost: { select: { name: true } } } },
} as const;
const paymentSort = [
  { cash: { transactionDate: "asc" as const } },
  { id: "asc" as const },
];
export async function allInvoiceExport(
  filters: TradeFilters,
): Promise<TradeExportData> {
  const today = todayJakarta();
  return getDb().$transaction(
    async (tx) => {
      const where = invoiceWhere(tx, filters, today),
        invoices = await tx.tradeInvoice.findMany({
          where,
          include: { expensePost: { select: { name: true } } },
          orderBy: [{ dueDate: "asc" }, { id: "asc" }],
        });
      const payments = await tx.tradePayment.findMany({
        where: { invoice: where },
        include: paymentInclude,
        orderBy: paymentSort,
      });
      return {
        invoices: invoices.map((r) => serializeInvoice(r, today)),
        payments: payments.map(paymentRow),
        basis: `Seluruh hasil filter aktif, semua halaman. Posisi terkini per ${today}; riwayat pembayaran termasuk yang dibatalkan/dilepas.`,
        generatedAt: new Date().toISOString(),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
// Posisi historis dihitung dari tanggal kas, bukan cache paidAmount yang memuat semua tanggal.
// Koreksi/pembatalan mengikuti data aktif terkini, sama dengan basis laporan kas aplikasi.
export async function reportTradeSnapshot(
  tx: Prisma.TransactionClient,
  start: string,
  end: string,
) {
  const cutoff = databaseDate(end);
  const invoices = await tx.tradeInvoice.findMany({
    where: { cancelledAt: null, issueDate: { lte: cutoff } },
    include: {
      expensePost: { select: { name: true } },
      payments: {
        where: {
          voidedAt: null,
          cash: { deletedAt: null, transactionDate: { lte: cutoff } },
        },
        select: { amount: true },
      },
    },
    orderBy: [{ kind: "asc" }, { dueDate: "asc" }, { id: "asc" }],
  });
  const rows = invoices.map((r) => {
    const paid = r.payments
      .reduce((s, p) => s.add(p.amount.toFixed(0)), new ExactDecimal(0))
      .toFixed(0);
    return {
      ...serializeInvoice(r, end),
      paidAmount: paid,
      ...invoiceState(r.amount.toFixed(0), paid, dateOnly(r.dueDate), end),
    };
  });
  const payments = await tx.tradePayment.findMany({
    where: {
      voidedAt: null,
      invoice: { cancelledAt: null },
      cash: {
        deletedAt: null,
        transactionDate: { gte: databaseDate(start), lte: cutoff },
      },
    },
    include: paymentInclude,
    orderBy: paymentSort,
  });
  const data: TradeExportData = {
    invoices: rows,
    payments: payments.map(paymentRow),
    basis: `Posisi tagihan aktif s/d ${end}, termasuk tagihan sebelum awal periode. Dibayar dihitung dari kas s/d tanggal tersebut. Pembayaran hanya ${start} s/d ${end}, termasuk DP sebelum tanggal tagihan. Koreksi/pembatalan memakai data aktif terkini.`,
  };
  const remaining = (kind: TradeKind) =>
    rows
      .filter((r) => r.kind === kind)
      .reduce((s, r) => s.add(r.remaining), new ExactDecimal(0))
      .toFixed(0);
  return {
    ...data,
    receivableRemaining: remaining("RECEIVABLE"),
    payableRemaining: remaining("PAYABLE"),
  };
}
