import "server-only";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { serializable } from "@/lib/transaction";
import {
  categorySchema,
  nameKey,
  assertCategoryParent,
  type CategoryRow,
} from "./schema";

const usageSelect = {
  orders: true,
  subOrders: true,
  budgets: true,
  subBudgets: true,
  incomes: true,
  subIncomes: true,
} as const;
export async function getCategoryRows(): Promise<CategoryRow[]> {
  const rows = await getDb().productCategory.findMany({
    include: { _count: { select: usageSelect } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return rows.map(({ id, name, parentId, isActive, _count }) => ({
    id,
    name,
    parentId,
    isActive,
    usage: Object.values(_count).reduce((a, b) => a + b, 0),
  }));
}

export async function saveCategory(input: unknown, id?: string) {
  const data = categorySchema.parse(input);
  return serializable(getDb(), async (tx) => {
    const existing = id
      ? await tx.productCategory.findUnique({
          where: { id },
          include: { children: true, _count: { select: usageSelect } },
        })
      : null;
    if (id && !existing) throw new AppError("Kategori tidak ditemukan.", 404);
    const parent = data.parentId
      ? await tx.productCategory.findUnique({ where: { id: data.parentId } })
      : null;
    assertCategoryParent(
      id,
      parent,
      !!existing?.children.length,
      data.parentId,
      !!existing && existing.parentId === data.parentId && !data.isActive,
    );
    if (
      existing &&
      existing.parentId !== data.parentId &&
      Object.values(existing._count).some(Boolean)
    )
      throw new AppError(
        "Induk kategori yang sudah dipakai tidak dapat dipindahkan. Arsipkan lalu buat kategori baru.",
        409,
      );
    const values = { ...data, nameKey: nameKey(data.name) };
    const category = id
      ? await tx.productCategory.update({ where: { id }, data: values })
      : await tx.productCategory.create({ data: values });
    if (!data.isActive)
      await tx.productCategory.updateMany({
        where: { parentId: category.id },
        data: { isActive: false },
      });
    return category;
  });
}

export async function deleteCategory(id: string) {
  return serializable(getDb(), async (tx) => {
    const row = await tx.productCategory.findUnique({
      where: { id },
      include: {
        _count: { select: usageSelect },
        children: { include: { _count: { select: usageSelect } } },
      },
    });
    if (!row) throw new AppError("Kategori tidak ditemukan.", 404);
    const used = [row, ...row.children].some((item) =>
      Object.values(item._count).some(Boolean),
    );
    const ids = [id, ...row.children.map((child) => child.id)];
    if (used) {
      await tx.productCategory.updateMany({
        where: { id: { in: ids } },
        data: { isActive: false },
      });
      return {
        message:
          "Kategori yang telah dipakai beserta subkategorinya diarsipkan. Riwayat tetap tersimpan.",
      };
    }
    await tx.productCategory.deleteMany({ where: { parentId: id } });
    await tx.productCategory.delete({ where: { id } });
    return {
      message: "Kategori dan subkategori yang belum dipakai berhasil dihapus.",
    };
  });
}
