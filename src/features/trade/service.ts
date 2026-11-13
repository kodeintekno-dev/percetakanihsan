import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { serializable } from "@/lib/transaction";
import { AppError } from "@/lib/app-error";
import { databaseDate, dateOnly, todayJakarta } from "@/lib/date";
import { recordId } from "@/lib/validation";
import { invoiceState } from "./calculation";
import {
  invoiceSchema,
  invoiceEditSchema,
  paymentSchema,
  reasonSchema,
  type TradeFilters,
  type InvoiceRow,
  type InvoicePage,
} from "./schema";

const include = { expensePost: { select: { name: true } } } as const;
type StoredInvoice = Prisma.TradeInvoiceGetPayload<{ include: typeof include }>;
const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const revision = (old: { updatedAt: Date }, v: string) => {
  if (old.updatedAt.toISOString() !== new Date(v).toISOString())
    throw new AppError(
      "Tagihan berubah di sesi lain. Muat ulang sebelum menyimpan.",
      409,
    );
};
const nextRevision = (old: { updatedAt: Date }) =>
  new Date(Math.max(Date.now(), old.updatedAt.getTime() + 1));
export function serializeInvoice(
  r: StoredInvoice,
  today = todayJakarta(),
): InvoiceRow {
  return {
    id: r.id,
    kind: r.kind,
    reference: r.reference,
    partyName: r.partyName,
    issueDate: dateOnly(r.issueDate),
    dueDate: dateOnly(r.dueDate),
    amount: r.amount.toFixed(0),
    paidAmount: r.paidAmount.toFixed(0),
    ...invoiceState(
      r.amount.toFixed(0),
      r.paidAmount.toFixed(0),
      dateOnly(r.dueDate),
      today,
      !!r.cancelledAt,
    ),
    orderId: r.orderId,
    orderNumber: r.orderNumberSnapshot,
    expensePostId: r.expensePostId,
    expensePostName: r.expensePost?.name ?? null,
    notes: r.notes,
    updatedAt: r.updatedAt.toISOString(),
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    cancelReason: r.cancelReason,
  };
}
const serialize = serializeInvoice;
export function invoiceWhere(
  tx: Prisma.TransactionClient,
  filters: TradeFilters,
  today = todayJakarta(),
): Prisma.TradeInvoiceWhereInput {
  const fields = tx.tradeInvoice.fields;
  const base: Prisma.TradeInvoiceWhereInput = {
    kind: filters.kind,
    ...(filters.q
      ? {
          OR: ["reference", "partyName", "orderNumberSnapshot"].map((key) => ({
            [key]: { contains: filters.q, mode: "insensitive" },
          })),
        }
      : {}),
  };
  const status: Prisma.TradeInvoiceWhereInput =
    filters.status === "CANCELLED"
      ? { cancelledAt: { not: null } }
      : {
          cancelledAt: null,
          ...(filters.status === "OPEN"
            ? { paidAmount: 0 }
            : filters.status === "PARTIAL"
              ? { paidAmount: { gt: 0 }, amount: { gt: fields.paidAmount } }
              : filters.status === "PAID"
                ? { paidAmount: { equals: fields.amount } }
                : filters.status === "OVERDUE"
                  ? {
                      amount: { gt: fields.paidAmount },
                      dueDate: { lt: databaseDate(today) },
                    }
                  : {}),
        };
  return { AND: [base, status] };
}
async function load(tx: Prisma.TransactionClient, id: string) {
  const r = await tx.tradeInvoice.findUnique({ where: { id }, include });
  if (!r) throw new AppError("Tagihan tidak ditemukan.", 404);
  return r;
}
function active(r: StoredInvoice) {
  if (r.cancelledAt) throw new AppError("Tagihan sudah dibatalkan.", 409);
}
function conflict(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
    throw new AppError(
      "Nomor tagihan, pesanan, atau transaksi kas sudah digunakan. Muat ulang dan periksa daftar.",
      409,
    );
  throw e;
}

export async function listInvoices(
  filters: TradeFilters,
): Promise<InvoicePage> {
  const today = todayJakarta(),
    end = databaseDate(today);
  end.setUTCDate(end.getUTCDate() + 7);
  return getDb().$transaction(
    async (tx) => {
      const fields = tx.tradeInvoice.fields;
      const base: Prisma.TradeInvoiceWhereInput = {
        kind: filters.kind,
        ...(filters.q
          ? {
              OR: ["reference", "partyName", "orderNumberSnapshot"].map(
                (key) => ({
                  [key]: { contains: filters.q, mode: "insensitive" },
                }),
              ),
            }
          : {}),
      };
      const open: Prisma.TradeInvoiceWhereInput = {
        ...base,
        cancelledAt: null,
        amount: { gt: fields.paidAmount },
      };
      const where = invoiceWhere(tx, filters, today);
      const total = await tx.tradeInvoice.count({ where }),
        totalPages = Math.max(1, Math.ceil(total / 25)),
        page = Math.min(filters.page, totalPages);
      const rows = await tx.tradeInvoice.findMany({
        where,
        include,
        orderBy: [{ dueDate: "asc" }, { id: "asc" }],
        skip: (page - 1) * 25,
        take: 25,
      });
      const sum = async (extra: Prisma.TradeInvoiceWhereInput = {}) => {
        const r = await tx.tradeInvoice.aggregate({
          where: { AND: [open, extra] },
          _sum: { amount: true, paidAmount: true },
        });
        return (r._sum.amount ?? new Prisma.Decimal(0))
          .sub(r._sum.paidAmount ?? 0)
          .toFixed(0);
      };
      return {
        rows: rows.map((r) => serialize(r, today)),
        page,
        total,
        totalPages,
        today,
        summary: {
          remaining: await sum(),
          overdue: await sum({ dueDate: { lt: databaseDate(today) } }),
          dueSoon: await sum({
            dueDate: { gte: databaseDate(today), lte: end },
          }),
          openCount: await tx.tradeInvoice.count({ where: open }),
        },
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function getInvoice(id: string) {
  recordId.parse(id);
  return getDb().$transaction(
    async (tx) => {
      const r = await load(tx, id);
      const payments = await tx.tradePayment.findMany({
        where: { invoiceId: id },
        include: { cash: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      return {
        ...serialize(r),
        payments: payments.map((p) => ({
          id: p.id,
          cashId: p.cashId,
          amount: p.amount.toFixed(0),
          transactionDate: dateOnly(p.cash.transactionDate),
          description: p.cash.description,
          createdCash: p.createdCash,
          notes: p.notes,
          voidedAt: p.voidedAt?.toISOString() ?? null,
          voidReason: p.voidReason,
        })),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function createInvoice(input: unknown) {
  const data = invoiceSchema.parse(input),
    hash = digest(data);
  try {
    return await serializable(getDb(), async (tx) => {
      const old = await tx.tradeInvoice.findUnique({
        where: { id: data.id },
        include,
      });
      if (old) {
        if (old.requestHash !== hash)
          throw new AppError(
            "Kunci permintaan sudah dipakai. Buka form baru untuk tagihan lain.",
            409,
          );
        return serialize(old);
      }
      const order = data.orderId
        ? await tx.printOrder.findFirst({
            where: { id: data.orderId, deletedAt: null },
          })
        : null;
      if (data.orderId && !order)
        throw new AppError("Pesanan tidak tersedia.", 422);
      if (
        data.kind === "RECEIVABLE" &&
        (!order || !order.totalPrice.eq(data.amount))
      )
        throw new AppError(
          "Nilai piutang harus sama dengan total pesanan. Pilih ulang pesanan.",
          422,
        );
      if (order && data.issueDate < dateOnly(order.orderDate))
        throw new AppError(
          "Tanggal tagihan tidak boleh sebelum tanggal pesanan.",
          422,
        );
      if (
        data.kind === "RECEIVABLE" &&
        (await tx.tradeInvoice.findFirst({
          where: {
            kind: "RECEIVABLE",
            orderId: data.orderId,
            cancelledAt: null,
          },
        }))
      )
        throw new AppError(
          "Pesanan ini sudah memiliki tagihan aktif. Buka detail tagihan tersebut.",
          409,
        );
      const post = data.expensePostId
        ? await tx.expensePost.findUnique({ where: { id: data.expensePostId } })
        : null;
      if (data.kind === "PAYABLE" && !post?.isActive)
        throw new AppError("Pilih pos pengeluaran yang aktif.", 422);
      return serialize(
        await tx.tradeInvoice.create({
          data: {
            ...data,
            requestHash: hash,
            referenceKey: data.reference
              .normalize("NFKC")
              .toLocaleUpperCase("id-ID"),
            partyName:
              data.kind === "RECEIVABLE" ? order!.customerName : data.partyName,
            issueDate: databaseDate(data.issueDate),
            dueDate: databaseDate(data.dueDate),
            orderNumberSnapshot: order?.orderNumber,
            categoryId: data.kind === "RECEIVABLE" ? order!.categoryId : null,
            subcategoryId:
              data.kind === "RECEIVABLE" ? order!.subcategoryId : null,
            categoryNameSnapshot:
              data.kind === "RECEIVABLE" ? order!.categoryNameSnapshot : null,
            productNameSnapshot:
              data.kind === "RECEIVABLE" ? order!.productNameSnapshot : null,
            expenseGroupSnapshot: post?.group ?? null,
          },
          include,
        }),
      );
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const old = await getDb().tradeInvoice.findUnique({
        where: { id: data.id },
        include,
      });
      if (old?.requestHash === hash) return serialize(old);
    }
    conflict(e);
  }
}
export async function editInvoice(id: string, input: unknown) {
  recordId.parse(id);
  const d = invoiceEditSchema.parse(input);
  try {
    return await serializable(getDb(), async (tx) => {
      const old = await load(tx, id);
      active(old);
      revision(old, d.updatedAt);
      if (old.orderId) {
        const order = await tx.printOrder.findUniqueOrThrow({
          where: { id: old.orderId },
        });
        if (d.issueDate < dateOnly(order.orderDate))
          throw new AppError(
            "Tanggal tagihan tidak boleh sebelum tanggal pesanan.",
            422,
          );
      }
      if (
        old.kind === "RECEIVABLE" &&
        (d.amount !== old.amount.toFixed(0) || d.partyName !== old.partyName)
      )
        throw new AppError(
          "Pelanggan dan total piutang mengikuti pesanan. Batalkan tagihan tanpa pembayaran bila perlu mengganti pesanan.",
          422,
        );
      if (old.kind === "PAYABLE" && !d.partyName)
        throw new AppError("Nama pemasok wajib diisi.", 422);
      if (old.paidAmount.gt(d.amount))
        throw new AppError(
          "Total tagihan tidak boleh lebih kecil dari pembayaran yang sudah tercatat.",
          422,
        );
      const payments = await tx.tradePayment.findMany({
        where: { invoiceId: id, voidedAt: null, createdCash: true },
        include: { cash: true },
      });
      if (payments.some((p) => d.issueDate > dateOnly(p.cash.transactionDate)))
        throw new AppError(
          "Tanggal tagihan melewati pembayaran baru yang sudah tercatat.",
          422,
        );
      const { updatedAt, ...values } = d;
      void updatedAt;
      return serialize(
        await tx.tradeInvoice.update({
          where: { id },
          data: {
            ...values,
            referenceKey: d.reference
              .normalize("NFKC")
              .toLocaleUpperCase("id-ID"),
            issueDate: databaseDate(d.issueDate),
            dueDate: databaseDate(d.dueDate),
            updatedAt: nextRevision(old),
          },
          include,
        }),
      );
    });
  } catch (e) {
    conflict(e);
  }
}
export async function cancelInvoice(id: string, input: unknown) {
  recordId.parse(id);
  const d = reasonSchema.parse(input);
  return serializable(getDb(), async (tx) => {
    const old = await load(tx, id);
    active(old);
    revision(old, d.updatedAt);
    if (!old.paidAmount.isZero())
      throw new AppError(
        "Batalkan atau lepaskan seluruh pembayaran terlebih dahulu.",
        409,
      );
    return serialize(
      await tx.tradeInvoice.update({
        where: { id },
        data: {
          cancelledAt: new Date(),
          cancelReason: d.reason,
          updatedAt: nextRevision(old),
        },
        include,
      }),
    );
  });
}

function cashMatch(r: StoredInvoice): Prisma.CashTransactionWhereInput {
  return {
    deletedAt: null,
    orderId: r.orderId,
    ...(r.kind === "RECEIVABLE"
      ? {
          type: "INCOME",
          incomeKind: "SALE",
          categoryId: r.categoryId,
          subcategoryId: r.subcategoryId,
        }
      : {
          type: "EXPENSE",
          expensePostId: r.expensePostId,
          expenseGroupSnapshot: r.expenseGroupSnapshot,
        }),
    purchasedAsset: null,
    invoicePayments: { none: { voidedAt: null } },
  };
}
export async function paymentCandidates(id: string, q: string, page: number) {
  recordId.parse(id);
  return getDb().$transaction(
    async (tx) => {
      const r = await load(tx, id);
      active(r);
      const remaining = r.amount.sub(r.paidAmount);
      const where: Prisma.CashTransactionWhereInput = {
        ...cashMatch(r),
        amount: { lte: remaining },
        ...(q ? { description: { contains: q, mode: "insensitive" } } : {}),
      };
      const total = await tx.cashTransaction.count({ where }),
        totalPages = Math.max(1, Math.ceil(total / 10)),
        current = Math.min(page, totalPages);
      const rows = await tx.cashTransaction.findMany({
        where,
        orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
        skip: (current - 1) * 10,
        take: 10,
      });
      return {
        rows: rows.map((c) => ({
          id: c.id,
          amount: c.amount.toFixed(0),
          transactionDate: dateOnly(c.transactionDate),
          description: c.description,
        })),
        page: current,
        totalPages,
        total,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function recordPayment(invoiceId: string, input: unknown) {
  recordId.parse(invoiceId);
  const d = paymentSchema.parse(input),
    { updatedAt, ...payload } = d;
  const hash = digest({ invoiceId, ...payload });
  try {
    return await serializable(getDb(), async (tx) => {
      const oldPayment = await tx.tradePayment.findUnique({
        where: { id: d.id },
      });
      if (oldPayment) {
        if (oldPayment.requestHash !== hash || oldPayment.voidedAt)
          throw new AppError(
            "Permintaan pembayaran sudah digunakan atau dibatalkan.",
            409,
          );
        return { invoiceId, replayed: true };
      }
      const r = await load(tx, invoiceId);
      active(r);
      revision(r, updatedAt);
      const remaining = r.amount.sub(r.paidAmount);
      if (remaining.lte(0)) throw new AppError("Tagihan sudah lunas.", 409);
      let cash;
      if (d.mode === "LINK") {
        cash = await tx.cashTransaction.findFirst({
          where: { id: d.cashId, ...cashMatch(r) },
        });
        if (!cash)
          throw new AppError(
            "Transaksi harus aktif, belum tertaut, bukan pembelian aset, dan sesuai jenis, pos/kategori serta pesanan tagihan.",
            422,
          );
      } else {
        if (d.transactionDate < dateOnly(r.issueDate))
          throw new AppError(
            "Tanggal pembayaran baru tidak boleh sebelum tanggal tagihan. Gunakan Hubungkan pembayaran lama untuk DP yang sudah tercatat.",
            422,
          );
        if (remaining.lt(d.amount))
          throw new AppError("Pembayaran melebihi sisa tagihan.", 422);
        const opening = await tx.cashOpeningSetting.findUnique({
          where: { id: 1 },
        });
        if (
          opening?.isConfigured &&
          d.transactionDate < dateOnly(opening.openingDate)
        )
          throw new AppError(
            "Tanggal pembayaran tidak boleh sebelum tanggal pembukaan kas.",
            422,
          );
        cash = await tx.cashTransaction.create({
          data: {
            transactionDate: databaseDate(d.transactionDate),
            type: r.kind === "RECEIVABLE" ? "INCOME" : "EXPENSE",
            description: `Pembayaran ${r.reference} · ${r.partyName}${d.notes ? ` · ${d.notes}` : ""}`,
            amount: d.amount,
            orderId: r.orderId,
            expensePostId: r.expensePostId,
            expenseGroupSnapshot: r.expenseGroupSnapshot,
            incomeKind: r.kind === "RECEIVABLE" ? "SALE" : null,
            categoryId: r.categoryId,
            subcategoryId: r.subcategoryId,
            categoryNameSnapshot: r.categoryNameSnapshot,
            productNameSnapshot: r.productNameSnapshot,
            soldQuantity: null,
            soldUnit: null,
          },
        });
      }
      if (cash.amount.gt(remaining))
        throw new AppError(
          "Nominal transaksi melebihi sisa tagihan. Satu transaksi ditautkan utuh ke satu tagihan.",
          422,
        );
      await tx.tradePayment.create({
        data: {
          id: d.id,
          requestHash: hash,
          invoiceId,
          cashId: cash.id,
          amount: cash.amount,
          createdCash: d.mode === "NEW",
          notes: d.notes,
        },
      });
      await tx.tradeInvoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: { increment: cash.amount },
          updatedAt: nextRevision(r),
        },
      });
      return { invoiceId, replayed: false };
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const old = await getDb().tradePayment.findUnique({
        where: { id: d.id },
      });
      if (old?.requestHash === hash && !old.voidedAt)
        return { invoiceId, replayed: true };
    }
    conflict(e);
  }
}
export async function voidPayment(
  invoiceId: string,
  paymentId: string,
  input: unknown,
) {
  recordId.parse(invoiceId);
  recordId.parse(paymentId);
  const d = reasonSchema.parse(input);
  return serializable(getDb(), async (tx) => {
    const r = await load(tx, invoiceId);
    active(r);
    const p = await tx.tradePayment.findFirst({
      where: { id: paymentId, invoiceId },
      include: { cash: true },
    });
    if (!p) throw new AppError("Pembayaran tidak ditemukan.", 404);
    if (p.voidedAt) return { invoiceId, replayed: true };
    revision(r, d.updatedAt);
    if (
      p.createdCash &&
      (await tx.fixedAsset.findUnique({ where: { purchaseCashId: p.cashId } }))
    )
      throw new AppError("Koreksi tautan aset terlebih dahulu.", 409);
    await tx.tradePayment.update({
      where: { id: paymentId },
      data: { voidedAt: new Date(), voidReason: d.reason },
    });
    if (p.createdCash)
      await tx.cashTransaction.update({
        where: { id: p.cashId },
        data: { deletedAt: new Date(), updatedAt: nextRevision(p.cash) },
      });
    await tx.tradeInvoice.update({
      where: { id: invoiceId },
      data: { paidAmount: { decrement: p.amount }, updatedAt: nextRevision(r) },
    });
    return { invoiceId, replayed: false };
  });
}
