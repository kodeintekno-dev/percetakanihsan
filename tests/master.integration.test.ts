import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import {
  getCategoryRows,
  saveCategory,
  deleteCategory,
} from "@/features/categories/service";
import {
  getExpenseRows,
  saveExpense,
  deleteExpense,
} from "@/features/expenses/service";
import { seedExamples } from "../prisma/seed";

const url = process.env.TEST_DATABASE_URL;
if (url && url === process.env.DATABASE_URL)
  throw new Error(
    "TEST_DATABASE_URL harus terpisah dari DATABASE_URL aplikasi.",
  );
if (url) process.env.DATABASE_URL = url;
const prefix = `qa-${randomUUID().slice(0, 8)}`;
const categoryIds: string[] = [],
  expenseIds: string[] = [],
  orderIds: string[] = [],
  cashIds: string[] = [];

describe.skipIf(!url)(
  "PostgreSQL TEST terpisah: CAT-01..04 / POS-01..02",
  () => {
    beforeAll(async () => {
      await getDb().$queryRaw`SELECT 1`;
    });
    afterAll(async () => {
      const db = getDb();
      await db.cashTransaction.deleteMany({ where: { id: { in: cashIds } } });
      await db.printOrder.deleteMany({ where: { id: { in: orderIds } } });
      await db.productCategory.deleteMany({
        where: { id: { in: categoryIds }, parentId: { not: null } },
      });
      await db.productCategory.deleteMany({
        where: { id: { in: categoryIds } },
      });
      await db.expensePost.deleteMany({ where: { id: { in: expenseIds } } });
      await db.$disconnect();
    });
    async function root(suffix: string) {
      const row = await saveCategory({
        name: `${prefix}-${suffix}`,
        parentId: null,
      });
      categoryIds.push(row.id);
      return row;
    }
    it("CAT-01 create/read ulang/edit/delete kategori tanpa referensi", async () => {
      const row = await root("crud");
      expect((await getCategoryRows()).find((r) => r.id === row.id)?.name).toBe(
        row.name,
      );
      await saveCategory({ name: `${prefix}-diubah`, parentId: null }, row.id);
      expect((await getCategoryRows()).find((r) => r.id === row.id)?.name).toBe(
        `${prefix}-diubah`,
      );
      await deleteCategory(row.id);
      expect(
        await getDb().productCategory.findUnique({ where: { id: row.id } }),
      ).toBeNull();
    });
    it("CAT-02/03 level tiga, siklus, self dan duplikat case-insensitive tertolak; aman saat paralel", async () => {
      const parent = await root("parent");
      const child = await saveCategory({
        name: `${prefix}-child`,
        parentId: parent.id,
      });
      categoryIds.push(child.id);
      await expect(
        saveCategory({ name: "Level tiga", parentId: child.id }),
      ).rejects.toThrow();
      await expect(
        saveCategory({ name: parent.name, parentId: child.id }, parent.id),
      ).rejects.toThrow();
      await expect(
        saveCategory({ name: child.name, parentId: child.id }, child.id),
      ).rejects.toThrow();
      await expect(
        saveCategory({ name: parent.name.toUpperCase(), parentId: null }),
      ).rejects.toThrow();
      await expect(
        saveCategory({ name: child.name.toUpperCase(), parentId: parent.id }),
      ).rejects.toThrow();
      const simultaneous = await Promise.allSettled([
        root("concurrent"),
        root("concurrent"),
      ]);
      expect(simultaneous.filter((r) => r.status === "fulfilled")).toHaveLength(
        1,
      );
      // Trigger DB juga menolak penulisan level 3 di luar service.
      await expect(
        getDb().productCategory.create({
          data: { name: "Level3", nameKey: "level3", parentId: child.id },
        }),
      ).rejects.toThrow();
    });
    it("CAT-04 arsip cascading menjaga order dan snapshot setelah rename", async () => {
      const parent = await root("history");
      const child = await saveCategory({
        name: `${prefix}-produk-lama`,
        parentId: parent.id,
      });
      categoryIds.push(child.id);
      const order = await getDb().printOrder.create({
        data: {
          orderNumber: `${prefix}-order`,
          orderDate: new Date("2026-11-03"),
          customerName: "Fixture TEST",
          categoryId: parent.id,
          subcategoryId: child.id,
          categoryNameSnapshot: parent.name,
          productNameSnapshot: child.name,
          quantity: 1,
          unit: "pcs",
          unitPrice: 1000,
          totalPrice: 1000,
        },
      });
      orderIds.push(order.id);
      await saveCategory(
        { name: `${prefix}-produk-baru`, parentId: parent.id },
        child.id,
      );
      expect((await deleteCategory(parent.id)).message).toContain("diarsipkan");
      const saved = await getDb().printOrder.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(saved.productNameSnapshot).toBe(child.name);
      expect(
        (await getCategoryRows())
          .filter((r) => [parent.id, child.id].includes(r.id))
          .every((r) => !r.isActive),
      ).toBe(true);
      await expect(
        saveCategory({ name: "Anak baru", parentId: parent.id }),
      ).rejects.toThrow();
    await saveCategory({ name: `${prefix}-arsip-diubah`, parentId: parent.id, isActive: false }, child.id);
    await expect(saveCategory({ name: child.name, parentId: parent.id, isActive: true }, child.id)).rejects.toThrow();
    });
    it("POS-01 CRUD seluruh enum; POS-02 klasifikasi snapshot tetap setelah rename/regroup/arsip", async () => {
      for (const group of ["PRODUCTION", "OPERATIONAL", "MARKETING"] as const) {
        const post = await saveExpense({ name: `${prefix}-${group}`, group });
        expenseIds.push(post.id);
        expect((await getExpenseRows()).some((r) => r.id === post.id)).toBe(
          true,
        );
        if (group !== "PRODUCTION") {
          await deleteExpense(post.id);
          expect(
            await getDb().expensePost.findUnique({ where: { id: post.id } }),
          ).toBeNull();
          continue;
        }
        const cash = await getDb().cashTransaction.create({
          data: {
            transactionDate: new Date("2026-11-03"),
            type: "EXPENSE",
            description: "Fixture TEST",
            amount: 1000,
            expensePostId: post.id,
            expenseGroupSnapshot: group,
          },
        });
        cashIds.push(cash.id);
        await saveExpense(
          { name: `${prefix}-nama-baru`, group: "MARKETING" },
          post.id,
        );
        expect((await deleteExpense(post.id)).message).toContain("diarsipkan");
        const historical = await getDb().cashTransaction.findUniqueOrThrow({
          where: { id: cash.id },
          include: { expensePost: true },
        });
        expect(historical.expenseGroupSnapshot).toBe("PRODUCTION");
        expect(historical.expensePost?.group).toBe("MARKETING");
        expect(historical.expensePost?.isActive).toBe(false);
      }
    });
    it("seed idempotent mempertahankan rename dan hapus contoh pengguna", async () => {
      await seedExamples(getDb());
      const before = await getDb().productCategory.count();
      await seedExamples(getDb());
      expect(await getDb().productCategory.count()).toBe(before);
      const example = await getDb().productCategory.findFirst({
        where: { parentId: null, nameKey: "brosur" },
      });
      if (example) await deleteCategory(example.id);
      const banner = await getDb().expensePost.findFirst({
        where: { nameKey: "tinta" },
      });
      if (banner)
        await saveExpense(
          { name: "Tinta disesuaikan pengguna", group: "PRODUCTION" },
          banner.id,
        );
      await seedExamples(getDb());
      expect(
        await getDb().productCategory.findFirst({
          where: { nameKey: "brosur" },
        }),
      ).toBeNull();
      if (banner)
        expect(
          (
            await getDb().expensePost.findUniqueOrThrow({
              where: { id: banner.id },
            })
          ).name,
        ).toBe("Tinta disesuaikan pengguna");
    });
  },
);
