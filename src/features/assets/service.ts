import "server-only";
import { getDb } from "@/lib/db";
import { serializable } from "@/lib/transaction";
import { AppError } from "@/lib/errors";
import { databaseDate, dateOnly } from "@/lib/date";
import { assetSchema, assetStopSchema, type AssetRow } from "./schema";
import type { FixedAsset } from "@/generated/prisma/client";
export const serializeAsset = (a: FixedAsset): AssetRow => ({
  ...a,
  acquisitionCost: a.acquisitionCost.toFixed(0),
  startDate: dateOnly(a.startDate),
  stopDate: a.stopDate ? dateOnly(a.stopDate) : null,
  updatedAt: a.updatedAt.toISOString(),
});
export async function listAssets() {
  return (
    await getDb().fixedAsset.findMany({
      orderBy: [{ startDate: "desc" }, { id: "asc" }],
    })
  ).map(serializeAsset);
}
export async function createAsset(input: unknown) {
  const data = assetSchema.parse(input);
  return serializable(getDb(), async (tx) => {
    const existing = await tx.fixedAsset.findUnique({ where: { id: data.id } });
    if (existing) {
      if (!data.updatedAt) {
        if (
          existing.name !== data.name ||
          existing.acquisitionCost.toFixed(0) !== data.acquisitionCost ||
          dateOnly(existing.startDate) !== data.startDate ||
          existing.usefulMonths !== data.usefulMonths ||
          existing.purchaseCashId !== data.purchaseCashId
        )
          throw new AppError(
            "Permintaan sudah digunakan. Muat ulang form untuk aset lain.",
            409,
          );
        return serializeAsset(existing);
      }
      if (existing.updatedAt.toISOString() !== data.updatedAt)
        throw new AppError(
          "Data berubah. Muat ulang sebelum mengoreksi aset.",
          409,
        );
      if (existing.stopDate && dateOnly(existing.stopDate) < data.startDate)
        throw new AppError(
          "Tanggal mulai melewati tanggal penghentian. Koreksi penghentian terlebih dahulu.",
          422,
        );
    }
    if (data.purchaseCashId) {
      const cash = await tx.cashTransaction.findFirst({
        where: { id: data.purchaseCashId, type: "EXPENSE", deletedAt: null },
        include: { purchasedAsset: true },
      });
      if (
        !cash ||
        (cash.purchasedAsset && cash.purchasedAsset.id !== data.id) ||
        !cash.amount.eq(data.acquisitionCost)
      )
        throw new AppError(
          "Pilih satu pengeluaran pembelian aset yang belum ditautkan dan nominalnya sama dengan harga perolehan.",
          422,
        );
    }
    const { updatedAt: revision, ...values } = data;
    void revision;
    return serializeAsset(
      existing
        ? await tx.fixedAsset.update({
            where: { id: data.id },
            data: {
              ...values,
              startDate: databaseDate(data.startDate),
              updatedAt: new Date(
                Math.max(Date.now(), existing.updatedAt.getTime() + 1),
              ),
            },
          })
        : await tx.fixedAsset.create({
            data: { ...values, startDate: databaseDate(data.startDate) },
          }),
    );
  });
}
export async function stopAsset(id: string, input: unknown) {
  const data = assetStopSchema.parse(input);
  return serializable(getDb(), async (tx) => {
    const old = await tx.fixedAsset.findUnique({ where: { id } });
    if (!old) throw new AppError("Aset tidak ditemukan.", 404);
    if (old.updatedAt.toISOString() !== data.updatedAt)
      throw new AppError("Data berubah. Muat ulang halaman.", 409);
    if (data.stopDate && data.stopDate < dateOnly(old.startDate))
      throw new AppError(
        "Tanggal penghentian tidak boleh sebelum mulai digunakan.",
        422,
      );
    return serializeAsset(
      await tx.fixedAsset.update({
        where: { id },
        data: {
          stopDate: data.stopDate ? databaseDate(data.stopDate) : null,
          updatedAt: new Date(
            Math.max(Date.now(), old.updatedAt.getTime() + 1),
          ),
        },
      }),
    );
  });
}
