import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/app-error";
import { serializable } from "@/lib/transaction";
import { databaseDate, dateOnly } from "@/lib/date";
import { ExactDecimal } from "@/lib/money";
import { recordId } from "@/lib/validation";
import { cashWhere } from "./query";
import { cashTotals } from "./aggregates";
import {
  createCashSchema,
  updateCashSchema,
  removeCashSchema,
  openingSchema,
  type CashInput,
  type CashRow,
  type CashFilters,
  type CashPage,
  type OpeningState,
} from "./schema";

const include = {
  expensePost: { select: { name: true } },
  order: { select: { orderNumber: true, customerName: true } },
} as const;
type StoredCash = Prisma.CashTransactionGetPayload<{ include: typeof include }>;
const serialize = (row: StoredCash): CashRow => ({
  id: row.id,
  transactionDate: dateOnly(row.transactionDate),
  type: row.type,
  description: row.description,
  amount: row.amount.toFixed(0),
  expensePostId: row.expensePostId,
  expensePostName: row.expensePost?.name ?? null,
  expenseGroupSnapshot: row.expenseGroupSnapshot,
  incomeKind: row.incomeKind,
  categoryId: row.categoryId,
  subcategoryId: row.subcategoryId,
  categoryNameSnapshot: row.categoryNameSnapshot,
  productNameSnapshot: row.productNameSnapshot,
  orderId: row.orderId,
  orderNumber: row.order?.orderNumber ?? null,
  orderCustomerName: row.order?.customerName ?? null,
  soldQuantity: row.soldQuantity?.toFixed(3) ?? null,
  soldUnit: row.soldUnit,
  updatedAt: row.updatedAt.toISOString(),
});
function current(row: StoredCash | null, revision: string) {
  if (!row || row.deletedAt)
    throw new AppError("Transaksi tidak ditemukan atau sudah dihapus.", 404);
  if (row.updatedAt.toISOString() !== new Date(revision).toISOString())
    throw new AppError(
      "Transaksi berubah di sesi lain. Muat ulang sebelum menyimpan.",
      409,
    );
  return row;
}
function issue(field: string, message: string): never {
  throw new AppError(message, 422, { [field]: [message] });
}

export async function orderAllocation(
  tx: Prisma.TransactionClient,
  orderId: string,
  excludeId?: string,
) {
  const order = await tx.printOrder.findFirst({
    where: { id: orderId, deletedAt: null },
  });
  if (!order)
    throw new AppError("Pesanan tidak ditemukan atau sudah dihapus.", 404);
  const sum = await tx.cashTransaction.aggregate({
    where: {
      orderId,
      deletedAt: null,
      type: "INCOME",
      incomeKind: "SALE",
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    _sum: { soldQuantity: true },
  });
  const allocated = new ExactDecimal(sum._sum.soldQuantity?.toFixed(3) ?? "0");
  return {
    order,
    allocated,
    remaining: new ExactDecimal(order.quantity.toFixed(3)).sub(allocated),
  };
}
export async function getOrderAllocation(orderId: string, excludeId?: string) {
  recordId.parse(orderId);
  if (excludeId) recordId.parse(excludeId);
  return getDb().$transaction(
    async (tx) => {
      if (excludeId) {
        const row = await tx.cashTransaction.findFirst({
          where: { id: excludeId, orderId, deletedAt: null },
        });
        if (!row)
          throw new AppError(
            "Transaksi pengecualian tidak terkait pesanan ini.",
            422,
          );
      }
      const result = await orderAllocation(tx, orderId, excludeId);
      return {
        orderId,
        quantity: result.order.quantity.toFixed(3),
        unit: result.order.unit,
        allocatedQuantity: result.allocated.toFixed(3),
        remainingQuantity: result.remaining.toFixed(3),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

async function valuesFor(
  tx: Prisma.TransactionClient,
  data: CashInput,
  old: StoredCash | null,
) {
  const opening = await tx.cashOpeningSetting.findUnique({ where: { id: 1 } });
  if (
    opening?.isConfigured &&
    data.transactionDate < dateOnly(opening.openingDate)
  )
    issue(
      "transactionDate",
      `Tanggal transaksi harus pada atau setelah tanggal pembukaan kas ${dateOnly(opening.openingDate)}.`,
    );
  let expenseGroup: CashRow["expenseGroupSnapshot"] = null,
    categoryName: string | null = null,
    productName: string | null = null;
  let soldUnit = data.soldUnit;
  if (data.type === "EXPENSE") {
    const post = await tx.expensePost.findUnique({
      where: { id: data.expensePostId! },
    });
    const unchanged =
      old?.type === "EXPENSE" && old.expensePostId === data.expensePostId;
    if (!post || (!unchanged && !post.isActive))
      issue("expensePostId", "Pilih pos pengeluaran yang aktif.");
    expenseGroup = unchanged ? old!.expenseGroupSnapshot : post.group;
  } else if (data.incomeKind === "SALE") {
    const parent = await tx.productCategory.findUnique({
      where: { id: data.categoryId! },
    });
    const child = data.subcategoryId
      ? await tx.productCategory.findUnique({
          where: { id: data.subcategoryId },
        })
      : null;
    const unchanged =
      old?.type === "INCOME" &&
      old.incomeKind === "SALE" &&
      old.categoryId === data.categoryId &&
      old.subcategoryId === data.subcategoryId;
    if (!parent || parent.parentId || (!unchanged && !parent.isActive))
      issue("categoryId", "Pilih kategori utama yang aktif.");
    if (
      data.subcategoryId &&
      (!child ||
        child.parentId !== parent.id ||
        (!unchanged && !child.isActive))
    )
      issue(
        "subcategoryId",
        "Subkategori harus aktif dan sesuai kategori utama.",
      );
    categoryName = unchanged ? old!.categoryNameSnapshot : parent.name;
    productName = unchanged
      ? old!.productNameSnapshot
      : (child?.name ?? parent.name);
    if (data.orderId) {
      const allocation = await orderAllocation(tx, data.orderId, old?.id);
      if (
        allocation.order.categoryId !== data.categoryId ||
        allocation.order.subcategoryId !== data.subcategoryId
      )
        issue(
          "orderId",
          "Kategori/subkategori pesanan harus sama dengan kategori penjualan.",
        );
      if (data.soldQuantity !== null) {
        if (
          data.soldUnit!.toLocaleLowerCase("id-ID") !==
          allocation.order.unit.toLocaleLowerCase("id-ID")
        )
          issue(
            "soldUnit",
            `Satuan harus sama dengan pesanan: ${allocation.order.unit}.`,
          );
        if (new ExactDecimal(data.soldQuantity).gt(allocation.remaining))
          issue(
            "soldQuantity",
            `Kuantitas melebihi sisa yang belum dialokasikan (${allocation.remaining.toFixed()} ${allocation.order.unit}).`,
          );
        soldUnit = allocation.order.unit;
      }
      if (!unchanged) {
        categoryName = allocation.order.categoryNameSnapshot;
        productName = allocation.order.productNameSnapshot;
      }
    }
  }
  return {
    ...data,
    transactionDate: databaseDate(data.transactionDate),
    expenseGroupSnapshot: expenseGroup,
    categoryNameSnapshot: categoryName,
    productNameSnapshot: productName,
    soldUnit,
  };
}

function requestHash(data: CashInput) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        ...data,
        amount: new ExactDecimal(data.amount).toFixed(0),
        soldQuantity:
          data.soldQuantity === null
            ? null
            : new ExactDecimal(data.soldQuantity).toFixed(3),
        soldUnit: data.soldUnit?.toLocaleLowerCase("id-ID") ?? null,
      }),
    )
    .digest("hex");
}
function replay(row: StoredCash, hash: string) {
  if (row.requestHash !== hash || row.deletedAt)
    throw new AppError(
      "Permintaan ini sudah digunakan untuk transaksi berbeda/terhapus. Periksa daftar atau buka form baru.",
      409,
    );
  return { row: serialize(row), replayed: true };
}
export async function createCash(input: unknown) {
  const { data, requestKey } = createCashSchema.parse(input),
    hash = requestHash(data);
  try {
    return await serializable(getDb(), async (tx) => {
      const existing = await tx.cashTransaction.findUnique({
        where: { requestKey },
        include,
      });
      if (existing) return replay(existing, hash);
      const values = await valuesFor(tx, data, null);
      return {
        row: serialize(
          await tx.cashTransaction.create({
            data: { ...values, requestKey, requestHash: hash },
            include,
          }),
        ),
        replayed: false,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await getDb().cashTransaction.findUnique({
        where: { requestKey },
        include,
      });
      if (existing) return replay(existing, hash);
    }
    throw error;
  }
}
export async function editCash(id: string, input: unknown) {
  const { data, updatedAt } = updateCashSchema.parse(input);
  return serializable(getDb(), async (tx) => {
    const old = current(
      await tx.cashTransaction.findUnique({ where: { id }, include }),
      updatedAt,
    );
    const values = await valuesFor(tx, data, old);
    return serialize(
      await tx.cashTransaction.update({
        where: { id, deletedAt: null },
        data: {
          ...values,
          updatedAt: new Date(
            Math.max(Date.now(), old.updatedAt.getTime() + 1),
          ),
        },
        include,
      }),
    );
  });
}
export async function deleteCash(id: string, input: unknown) {
  const { updatedAt } = removeCashSchema.parse(input);
  return serializable(getDb(), async (tx) => {
    const old = current(
      await tx.cashTransaction.findUnique({ where: { id }, include }),
      updatedAt,
    );
    await tx.cashTransaction.update({
      where: { id, deletedAt: null },
      data: {
        deletedAt: new Date(),
        updatedAt: new Date(Math.max(Date.now(), old.updatedAt.getTime() + 1)),
      },
    });
    return {
      message:
        "Transaksi dihapus dari daftar aktif. Hitungan kas diperbarui; record historis tetap disimpan.",
    };
  });
}
export async function getCash(id: string) {
  const row = await getDb().cashTransaction.findFirst({
    where: { id, deletedAt: null },
    include,
  });
  if (!row)
    throw new AppError("Transaksi tidak ditemukan atau sudah dihapus.", 404);
  return serialize(row);
}
async function checkedWhere(
  tx: Prisma.TransactionClient,
  filters: CashFilters,
) {
  if (
    filters.expensePostId &&
    !(await tx.expensePost.findUnique({ where: { id: filters.expensePostId } }))
  )
    issue(
      "expensePostId",
      "Pos filter tidak tersedia. Pilih ulang pos pengeluaran.",
    );
  return cashWhere(filters);
}
const sort = [{ transactionDate: "desc" as const }, { id: "desc" as const }];
export async function listCash(filters: CashFilters): Promise<CashPage> {
  return getDb().$transaction(
    async (tx) => {
      const where = await checkedWhere(tx, filters),
        total = await tx.cashTransaction.count({ where });
      const totalPages = Math.max(1, Math.ceil(total / filters.pageSize)),
        page = Math.min(filters.page, totalPages);
      const rows = await tx.cashTransaction.findMany({
        where,
        include,
        orderBy: sort,
        skip: (page - 1) * filters.pageSize,
        take: filters.pageSize,
      });
      return {
        rows: rows.map(serialize),
        total,
        totalPages,
        page,
        pageSize: filters.pageSize,
        totals: await cashTotals(tx, where),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function allFilteredCash(filters: CashFilters) {
  return getDb().$transaction(
    async (tx) =>
      (
        await tx.cashTransaction.findMany({
          where: await checkedWhere(tx, filters),
          include,
          orderBy: sort,
        })
      ).map(serialize),
    { isolationLevel: "RepeatableRead" },
  );
}
export async function getOpeningSettings(): Promise<{
  opening: OpeningState;
  transactionCount: number;
  firstTransactionDate: string | null;
}> {
  return getDb().$transaction(
    async (tx) => {
      const row = await tx.cashOpeningSetting.findUnique({ where: { id: 1 } });
      const stats = await tx.cashTransaction.aggregate({
        where: { deletedAt: null },
        _count: true,
        _min: { transactionDate: true },
      });
      return {
        opening: row?.isConfigured
          ? {
              openingDate: dateOnly(row.openingDate),
              openingAmount: row.openingAmount.toFixed(0),
              updatedAt: row.updatedAt.toISOString(),
            }
          : null,
        transactionCount: stats._count,
        firstTransactionDate: stats._min.transactionDate
          ? dateOnly(stats._min.transactionDate)
          : null,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function saveOpening(input: unknown) {
  const data = openingSchema.parse(input);
  return serializable(getDb(), async (tx) => {
    const old = await tx.cashOpeningSetting.findUnique({ where: { id: 1 } });
    if (
      (old?.isConfigured ? old.updatedAt.toISOString() : null) !==
      data.updatedAt
    )
      throw new AppError(
        "Pengaturan telah berubah. Muat ulang halaman sebelum menyimpan.",
        409,
      );
    const stats = await tx.cashTransaction.aggregate({
      where: { deletedAt: null },
      _count: true,
      _min: { transactionDate: true },
    });
    if (stats._count && !data.acknowledge)
      issue(
        "acknowledge",
        "Konfirmasi dampak perubahan saldo awal terhadap transaksi yang sudah tercatat.",
      );
    if (
      stats._min.transactionDate &&
      data.openingDate > dateOnly(stats._min.transactionDate)
    )
      issue(
        "openingDate",
        `Tanggal pembukaan tidak boleh melewati transaksi pertama (${dateOnly(stats._min.transactionDate)}).`,
      );
    const values = {
      openingDate: databaseDate(data.openingDate),
      openingAmount: data.openingAmount,
      isConfigured: true,
    };
    const row = old
      ? await tx.cashOpeningSetting.update({
          where: { id: 1 },
          data: {
            ...values,
            updatedAt: new Date(
              Math.max(Date.now(), old.updatedAt.getTime() + 1),
            ),
          },
        })
      : await tx.cashOpeningSetting.create({ data: { id: 1, ...values } });
    return {
      openingDate: dateOnly(row.openingDate),
      openingAmount: row.openingAmount.toFixed(0),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}
