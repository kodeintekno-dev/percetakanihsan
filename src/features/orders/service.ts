import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/app-error";
import { serializable } from "@/lib/transaction";
import { databaseDate, dateOnly } from "@/lib/date";
import { orderTotal, ExactDecimal } from "@/lib/money";
import {
  orderSchema,
  updateOrderSchema,
  statusUpdateSchema,
  deleteOrderSchema,
  type OrderFilters,
  type OrderRow,
  type OrderPage,
} from "./schema";
import { orderWhere } from "./query";

const include = {
  _count: { select: { incomes: true, budgets: true } },
} as const;
type StoredOrder = Prisma.PrintOrderGetPayload<{ include: typeof include }>;
const serialize = (row: StoredOrder): OrderRow => ({
  id: row.id,
  orderNumber: row.orderNumber,
  orderDate: dateOnly(row.orderDate),
  customerName: row.customerName,
  categoryId: row.categoryId,
  subcategoryId: row.subcategoryId,
  categoryNameSnapshot: row.categoryNameSnapshot,
  productNameSnapshot: row.productNameSnapshot,
  quantity: row.quantity.toFixed(3),
  unit: row.unit,
  unitPrice: row.unitPrice.toFixed(0),
  totalPrice: row.totalPrice.toFixed(0),
  status: row.status,
  notes: row.notes ?? "",
  updatedAt: row.updatedAt.toISOString(),
  incomeCount: row._count.incomes,
  budgetCount: row._count.budgets,
});
const sort = [{ orderDate: "desc" as const }, { id: "desc" as const }];

async function checkedWhere(
  tx: Prisma.TransactionClient,
  filters: OrderFilters,
) {
  if (filters.categoryId) {
    const parent = await tx.productCategory.findUnique({
      where: { id: filters.categoryId },
    });
    if (!parent || parent.parentId)
      throw new AppError(
        "Kategori filter harus kategori utama yang tersedia.",
        422,
        { categoryId: ["Pilih ulang kategori utama."] },
      );
    if (filters.subcategoryId) {
      const child = await tx.productCategory.findUnique({
        where: { id: filters.subcategoryId },
      });
      if (!child || child.parentId !== parent.id)
        throw new AppError(
          "Subkategori filter tidak sesuai kategori utama.",
          422,
          { subcategoryId: ["Pilih ulang subkategori."] },
        );
    }
  }
  return orderWhere(filters);
}

export async function listOrders(filters: OrderFilters): Promise<OrderPage> {
  return getDb().$transaction(
    async (tx) => {
      const where = await checkedWhere(tx, filters);
      const total = await tx.printOrder.count({ where });
      const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
      const page = Math.min(filters.page, totalPages);
      const rows = await tx.printOrder.findMany({
        where,
        include,
        orderBy: sort,
        skip: (page - 1) * filters.pageSize,
        take: filters.pageSize,
      });
      return {
        rows: rows.map(serialize),
        total,
        page,
        pageSize: filters.pageSize,
        totalPages,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

export async function allFilteredOrders(
  filters: OrderFilters,
): Promise<OrderRow[]> {
  return getDb().$transaction(
    async (tx) => {
      const where = await checkedWhere(tx, filters);
      return (
        await tx.printOrder.findMany({ where, include, orderBy: sort })
      ).map(serialize);
    },
    { isolationLevel: "RepeatableRead" },
  );
}

export async function getOrder(id: string) {
  const row = await getDb().printOrder.findFirst({
    where: { id, deletedAt: null },
    include,
  });
  if (!row)
    throw new AppError("Permintaan tidak ditemukan atau sudah dihapus.", 404);
  return serialize(row);
}

function assertRevision(row: StoredOrder | null, updatedAt: string) {
  if (!row || row.deletedAt)
    throw new AppError("Permintaan tidak ditemukan atau sudah dihapus.", 404);
  if (row.updatedAt.toISOString() !== new Date(updatedAt).toISOString())
    throw new AppError(
      "Permintaan telah berubah di sesi lain. Muat ulang sebelum menyimpan.",
      409,
    );
  return row;
}

export async function saveOrder(input: unknown, id?: string) {
  const parsed = id
    ? updateOrderSchema.parse(input)
    : { data: orderSchema.parse(input), updatedAt: undefined };
  const data = parsed.data;
  return serializable(getDb(), async (tx) => {
    const old = id
      ? assertRevision(
          await tx.printOrder.findUnique({ where: { id }, include }),
          parsed.updatedAt!,
        )
      : null;
    const parent = await tx.productCategory.findUnique({
      where: { id: data.categoryId },
    });
    const child = data.subcategoryId
      ? await tx.productCategory.findUnique({
          where: { id: data.subcategoryId },
        })
      : null;
    const unchanged =
      old?.categoryId === data.categoryId &&
      old?.subcategoryId === data.subcategoryId;
    if (!parent || parent.parentId || (!unchanged && !parent.isActive))
      throw new AppError("Pilih kategori utama yang aktif.", 422, {
        categoryId: ["Kategori utama tidak tersedia untuk pesanan baru."],
      });
    if (
      data.subcategoryId &&
      (!child ||
        child.parentId !== parent.id ||
        (!unchanged && !child.isActive))
    )
      throw new AppError(
        "Subkategori harus aktif dan milik kategori utama terpilih.",
        422,
        { subcategoryId: ["Pilih subkategori yang sesuai."] },
      );
    if (old && !unchanged && old._count.incomes)
      throw new AppError(
        "Kategori permintaan yang telah terkait transaksi kas tidak dapat diganti. Riwayat transaksi tetap dipertahankan.",
        409,
      );
    if (old) {
      const allocated = await tx.cashTransaction.aggregate({
        where: {
          orderId: old.id,
          deletedAt: null,
          type: "INCOME",
          incomeKind: "SALE",
        },
        _sum: { soldQuantity: true },
        _count: { soldQuantity: true },
      });
      if (
        new ExactDecimal(data.quantity).lt(
          allocated._sum.soldQuantity?.toFixed(3) ?? "0",
        )
      )
        throw new AppError(
          "Jumlah pesanan tidak boleh lebih kecil dari kuantitas yang sudah dialokasikan pada penerimaan kas.",
          409,
          {
            quantity: [
              "Koreksi alokasi kuantitas pada Buku Kas terlebih dahulu.",
            ],
          },
        );
      if (
        allocated._count.soldQuantity &&
        data.unit.toLocaleLowerCase("id-ID") !==
          old.unit.toLocaleLowerCase("id-ID")
      )
        throw new AppError(
          "Satuan pesanan tidak dapat diganti setelah kuantitas dialokasikan pada Buku Kas.",
          409,
          {
            unit: ["Koreksi alokasi kuantitas pada Buku Kas terlebih dahulu."],
          },
        );
    }
    const values = {
      ...data,
      orderDate: databaseDate(data.orderDate),
      totalPrice: orderTotal(data.quantity, data.unitPrice),
      categoryNameSnapshot: unchanged ? old!.categoryNameSnapshot : parent.name,
      productNameSnapshot: unchanged
        ? old!.productNameSnapshot
        : (child?.name ?? parent.name),
    };
    const row = id
      ? await tx.printOrder.update({
          where: { id, deletedAt: null },
          data: {
            ...values,
            updatedAt: new Date(
              Math.max(Date.now(), old!.updatedAt.getTime() + 1),
            ),
          },
          include,
        })
      : await tx.printOrder.create({
          data: {
            ...values,
            orderNumber: `IM-${data.orderDate.replaceAll("-", "")}-${randomBytes(6).toString("hex").toUpperCase()}`,
          },
          include,
        });
    return serialize(row);
  });
}

export async function changeOrderStatus(id: string, input: unknown) {
  const data = statusUpdateSchema.parse(input);
  return serializable(getDb(), async (tx) => {
    const old = assertRevision(
      await tx.printOrder.findUnique({ where: { id }, include }),
      data.updatedAt,
    );
    return serialize(
      await tx.printOrder.update({
        where: { id, deletedAt: null },
        data: {
          status: data.status,
          updatedAt: new Date(
            Math.max(Date.now(), old.updatedAt.getTime() + 1),
          ),
        },
        include,
      }),
    );
  });
}

export async function removeOrder(id: string, input: unknown) {
  const data = deleteOrderSchema.parse(input);
  return serializable(getDb(), async (tx) => {
    const row = assertRevision(
      await tx.printOrder.findUnique({ where: { id }, include }),
      data.updatedAt,
    );
    await tx.cashTransaction.updateMany({
      where: { orderId: id },
      data: { orderId: null },
    });
    await tx.budgetEstimate.updateMany({
      where: { orderId: id },
      data: { orderId: null },
    });
    await tx.printOrder.update({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return {
      message:
        "Permintaan berhasil dihapus dari daftar. Record historis disimpan; transaksi kas dan budgeting terkait tetap utuh.",
      incomeCount: row._count.incomes,
      budgetCount: row._count.budgets,
    };
  });
}
