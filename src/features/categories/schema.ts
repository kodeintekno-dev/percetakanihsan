import { z } from "zod";
import { AppError } from "@/lib/app-error";

export const cleanName = (value: string) => value.trim().replace(/\s+/gu, " ");
export const nameKey = (value: string) =>
  cleanName(value).toLocaleLowerCase("id-ID");
export const masterName = z
  .string()
  .transform(cleanName)
  .pipe(
    z.string().min(1, "Nama wajib diisi.").max(100, "Maksimal 100 karakter."),
  );
export const categorySchema = z
  .object({
    name: masterName,
    parentId: z.string().min(1).max(100).nullable(),
    isActive: z.boolean().default(true),
  })
  .strict();
export type CategoryRow = {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  usage: number;
};

export function assertCategoryParent(
  id: string | undefined,
  parent: { id: string; parentId: string | null; isActive: boolean } | null,
  hasChildren: boolean,
  parentId: string | null,
  allowInactiveParent = false,
) {
  if (!parentId) return;
  if (id === parentId)
    throw new AppError(
      "Kategori tidak boleh menjadi induk dirinya sendiri.",
      422,
      { parentId: ["Pilih kategori utama lain."] },
    );
  if (!parent || parent.parentId || (!parent.isActive && !allowInactiveParent))
    throw new AppError(
      "Induk harus kategori utama yang aktif. Maksimal dua level.",
      422,
      { parentId: ["Pilih kategori utama yang aktif."] },
    );
  if (hasChildren)
    throw new AppError(
      "Kategori yang memiliki subkategori tidak dapat dijadikan subkategori.",
      422,
      { parentId: ["Pindahkan subkategori terlebih dahulu."] },
    );
}

export function cascadingOptions(rows: CategoryRow[], parentId: string) {
  const parent = rows.find(
    (row) => row.id === parentId && row.parentId === null && row.isActive,
  );
  return parent
    ? rows.filter((row) => row.parentId === parent.id && row.isActive)
    : [];
}
