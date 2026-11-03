import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/app-error";
import { serializable } from "@/lib/transaction";
import { ExactDecimal } from "@/lib/money";
import { todayJakarta } from "@/lib/date";
import {
  calculateCutting,
  calculateMaterial,
} from "@/lib/calculations/cutting";
import {
  budgetSchema,
  updateBudgetSchema,
  deleteBudgetSchema,
  budgetCalculation,
  type BudgetDetail,
  type BudgetSummary,
  type BudgetInput,
  type BudgetFilters,
  type PaperSnapshot,
} from "./schema";
import { budgetWhere } from "./query";
const include = {
  costItems: { orderBy: { sortOrder: "asc" as const } },
  paperCut: true,
} as const;
const listInclude = { _count: { select: { costItems: true } } } as const;
type Stored = Prisma.BudgetEstimateGetPayload<{ include: typeof include }>;
type SummaryStored = Prisma.BudgetEstimateGetPayload<{
  include: typeof listInclude;
}>;
function summary(row: Stored | SummaryStored): BudgetSummary {
  return {
    id: row.id,
    budgetNumber: row.budgetNumber,
    title: row.title,
    orderId: row.orderId,
    orderNumberSnapshot: row.orderNumberSnapshot,
    customerNameSnapshot: row.customerNameSnapshot,
    categoryId: row.categoryId,
    subcategoryId: row.subcategoryId,
    categoryNameSnapshot: row.categoryNameSnapshot,
    productNameSnapshot: row.productNameSnapshot,
    quantity: row.quantity.toFixed(3),
    unit: row.unit,
    marginMode: row.marginMode,
    marginValue: row.marginValue.toFixed(
      row.marginMode === "FIXED_AMOUNT" ? 0 : 2,
    ),
    totalHpp: row.totalHpp.toFixed(0),
    hppPerUnit: row.hppPerUnit.toFixed(4),
    suggestedSellingTotal: row.suggestedSellingTotal.toFixed(0),
    suggestedSellingPerUnit: new ExactDecimal(
      row.suggestedSellingTotal.toFixed(0),
    )
      .div(row.quantity.toFixed(3))
      .toFixed(4),
    costCount: "_count" in row ? row._count.costItems : row.costItems.length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function detail(row: Stored): BudgetDetail {
  const p = row.paperCut,
    paperCut = p
      ? {
          sheetLengthCm: p.sheetLengthCm.toFixed(2),
          sheetWidthCm: p.sheetWidthCm.toFixed(2),
          cutLengthCm: p.cutLengthCm.toFixed(2),
          cutWidthCm: p.cutWidthCm.toFixed(2),
          selectedOrientation:
            p.selectedOrientation === "ORIGINAL"
              ? ("original" as const)
              : ("rotated" as const),
          material:
            p.requiredFinishedPieces !== null && p.paperPricePerSheet !== null
              ? {
                  requiredFinishedPieces: p.requiredFinishedPieces.toFixed(0),
                  paperPricePerSheet: p.paperPricePerSheet.toFixed(0),
                }
              : null,
        }
      : null;
  let snapshot: PaperSnapshot | null = null;
  if (p?.calculationSnapshot) {
    snapshot = JSON.parse(
      JSON.stringify(p.calculationSnapshot),
    ) as PaperSnapshot;
    if (
      snapshot.version !== "uniform-grid-v1" ||
      !snapshot.calculation?.original ||
      !snapshot.calculation?.rotated
    )
      throw new AppError(
        "Format snapshot potong tidak dikenali. Hubungi pengelola aplikasi.",
        503,
      );
  } else if (paperCut) {
    const c = calculateCutting(paperCut);
    snapshot = {
      version: "uniform-grid-v1",
      calculation: c,
      selectedOrientation: paperCut.selectedOrientation,
      material: paperCut.material
        ? calculateMaterial(
            c,
            paperCut.selectedOrientation,
            paperCut.material.requiredFinishedPieces,
            paperCut.material.paperPricePerSheet,
          )
        : null,
    };
  }
  return {
    ...summary(row),
    items: row.costItems.map((i) => ({
      id: i.id,
      label: i.label,
      costType: i.costType,
      quantity: i.quantity.toFixed(3),
      unitCost: i.unitCost.toFixed(0),
      totalCost: i.totalCost.toFixed(0),
      fromPaperCut: i.fromPaperCut,
    })),
    paperCut,
    paperSnapshot: snapshot,
    legacySnapshot: !!p && !p.calculationSnapshot,
  };
}
function revision(row: Stored | null, updatedAt: string) {
  if (!row || row.deletedAt)
    throw new AppError("Estimasi tidak ditemukan atau sudah dihapus.", 404);
  if (row.updatedAt.toISOString() !== new Date(updatedAt).toISOString())
    throw new AppError(
      "Estimasi berubah di sesi lain. Muat ulang sebelum menyimpan.",
      409,
    );
  return row;
}
function issue(field: string, message: string): never {
  throw new AppError(message, 422, { [field]: [message] });
}
async function valuesFor(
  tx: Prisma.TransactionClient,
  data: BudgetInput,
  old: Stored | null,
) {
  const parent = await tx.productCategory.findUnique({
      where: { id: data.categoryId },
    }),
    child = data.subcategoryId
      ? await tx.productCategory.findUnique({
          where: { id: data.subcategoryId },
        })
      : null;
  const unchanged =
    old?.categoryId === data.categoryId &&
    old?.subcategoryId === data.subcategoryId;
  if (!parent || parent.parentId || (!unchanged && !parent.isActive))
    issue("categoryId", "Pilih kategori utama yang aktif.");
  if (
    data.subcategoryId &&
    (!child || child.parentId !== parent.id || (!unchanged && !child.isActive))
  )
    issue(
      "subcategoryId",
      "Subkategori harus sesuai kategori utama dan aktif.",
    );
  let categoryName = unchanged ? old!.categoryNameSnapshot : parent.name,
    productName = unchanged
      ? old!.productNameSnapshot
      : (child?.name ?? parent.name);
  let orderNumber = old?.orderNumberSnapshot ?? null,
    customerName = old?.customerNameSnapshot ?? null;
  if (data.orderId) {
    const order = await tx.printOrder.findFirst({
      where: { id: data.orderId, deletedAt: null },
    });
    if (!order) issue("orderId", "Pesanan tidak tersedia atau sudah dihapus.");
    if (
      order.categoryId !== data.categoryId ||
      order.subcategoryId !== data.subcategoryId
    )
      issue("orderId", "Kategori/subkategori estimasi harus sesuai pesanan.");
    if (old?.orderId !== data.orderId) {
      orderNumber = order.orderNumber;
      customerName = order.customerName;
    }
    if (!unchanged) {
      categoryName = order.categoryNameSnapshot;
      productName = order.productNameSnapshot;
    }
  }
  const { totals, snapshot } = budgetCalculation(data);
  const values = {
    title: data.title,
    orderId: data.orderId,
    orderNumberSnapshot: orderNumber,
    customerNameSnapshot: customerName,
    categoryId: data.categoryId,
    subcategoryId: data.subcategoryId,
    categoryNameSnapshot: categoryName,
    productNameSnapshot: productName,
    quantity: data.quantity,
    unit: data.unit,
    marginMode: data.marginMode,
    marginValue: data.marginValue.replace(",", "."),
    totalHpp: totals.totalHpp,
    hppPerUnit: totals.hppPerUnit,
    suggestedSellingTotal: totals.suggestedSellingTotal,
  };
  const items = data.items.map((i, index) => ({
    ...i,
    totalCost: totals.lineTotals[index],
    sortOrder: index,
  }));
  const p = data.paperCut,
    cut = snapshot?.calculation;
  const paper =
    p && cut
      ? {
          ...cut.input,
          selectedOrientation:
            p.selectedOrientation === "original"
              ? ("ORIGINAL" as const)
              : ("ROTATED" as const),
          originalYield: cut.original.yield,
          rotatedYield: cut.rotated.yield,
          chosenYield: cut[p.selectedOrientation].yield,
          wasteAreaCm2: cut[p.selectedOrientation].wasteAreaCm2,
          paperPricePerSheet: snapshot!.material?.paperPricePerSheet ?? null,
          requiredFinishedPieces:
            snapshot!.material?.requiredFinishedPieces ?? null,
          requiredParentSheets:
            snapshot!.material?.requiredParentSheets ?? null,
          calculationSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        }
      : null;
  return { values, items, paper };
}
export async function saveBudget(input: unknown, id?: string) {
  const parsed = id
    ? updateBudgetSchema.parse(input)
    : { data: budgetSchema.parse(input), updatedAt: undefined };
  return serializable(getDb(), async (tx) => {
    const old = id
      ? revision(
          await tx.budgetEstimate.findUnique({ where: { id }, include }),
          parsed.updatedAt!,
        )
      : null;
    const { values, items, paper } = await valuesFor(tx, parsed.data, old);
    if (!old) {
      return detail(
        await tx.budgetEstimate.create({
          data: {
            ...values,
            budgetNumber: `HPP-${todayJakarta().replaceAll("-", "")}-${randomBytes(6).toString("hex").toUpperCase()}`,
            costItems: { create: items },
            ...(paper ? { paperCut: { create: paper } } : {}),
          },
          include,
        }),
      );
    }
    // Satu transaksi: kegagalan item/snapshot membatalkan seluruh edit, termasuk penghapusan baris lama.
    await tx.budgetCostItem.deleteMany({ where: { budgetId: old.id } });
    await tx.paperCutSimulation.deleteMany({ where: { budgetId: old.id } });
    return detail(
      await tx.budgetEstimate.update({
        where: { id: old.id, deletedAt: null },
        data: {
          ...values,
          updatedAt: new Date(
            Math.max(Date.now(), old.updatedAt.getTime() + 1),
          ),
          costItems: { create: items },
          ...(paper ? { paperCut: { create: paper } } : {}),
        },
        include,
      }),
    );
  });
}
export async function getBudget(id: string) {
  const row = await getDb().budgetEstimate.findFirst({
    where: { id, deletedAt: null },
    include,
  });
  if (!row)
    throw new AppError("Estimasi tidak ditemukan atau sudah dihapus.", 404);
  return detail(row);
}
export async function deleteBudget(id: string, input: unknown) {
  const { updatedAt } = deleteBudgetSchema.parse(input);
  return serializable(getDb(), async (tx) => {
    const old = revision(
      await tx.budgetEstimate.findUnique({ where: { id }, include }),
      updatedAt,
    );
    await tx.budgetEstimate.update({
      where: { id, deletedAt: null },
      data: {
        deletedAt: new Date(),
        updatedAt: new Date(Math.max(Date.now(), old.updatedAt.getTime() + 1)),
      },
    });
    return {
      message:
        "Estimasi dihapus dari riwayat aktif. Komponen dan snapshot tetap tersimpan; kas tidak berubah.",
    };
  });
}
export async function listBudgets(filters: BudgetFilters) {
  return getDb().$transaction(
    async (tx) => {
      if (filters.categoryId) {
        const p = await tx.productCategory.findUnique({
          where: { id: filters.categoryId },
        });
        if (!p || p.parentId)
          issue("categoryId", "Pilih kategori utama yang tersedia.");
        if (filters.subcategoryId) {
          const c = await tx.productCategory.findUnique({
            where: { id: filters.subcategoryId },
          });
          if (c?.parentId !== p.id)
            issue("subcategoryId", "Subkategori filter tidak sesuai kategori.");
        }
      }
      const where = budgetWhere(filters),
        total = await tx.budgetEstimate.count({ where }),
        totalPages = Math.max(1, Math.ceil(total / filters.pageSize)),
        page = Math.min(filters.page, totalPages);
      const rows = await tx.budgetEstimate.findMany({
        where,
        include: listInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * filters.pageSize,
        take: filters.pageSize,
      });
      return {
        rows: rows.map(summary),
        total,
        totalPages,
        page,
        pageSize: filters.pageSize,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
