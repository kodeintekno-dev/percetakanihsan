import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { createDatabaseClient } from "@/lib/db-client";
import { saveCategory, deleteCategory } from "@/features/categories/service";
import { saveOrder, removeOrder } from "@/features/orders/service";
import {
  saveBudget,
  getBudget,
  listBudgets,
  deleteBudget,
} from "@/features/budget/service";
import { parseBudgetFilters } from "@/features/budget/schema";
import { getDashboard } from "@/features/cash/aggregates";
const url = process.env.TEST_DATABASE_URL;
if (url && url === process.env.DATABASE_URL)
  throw new Error("TEST_DATABASE_URL harus terpisah dari database aplikasi.");
if (url) process.env.DATABASE_URL = url;
const prefix = `hpp-${randomUUID().slice(0, 8)}`,
  categoryIds: string[] = [],
  budgetIds: string[] = [],
  orderIds: string[] = [];
let root: string, sub: string, other: string;
const paper = {
  sheetLengthCm: "107",
  sheetWidthCm: "80",
  cutLengthCm: "26",
  cutWidthCm: "20,5",
  selectedOrientation: "rotated",
  material: { requiredFinishedPieces: "100", paperPricePerSheet: "10000" },
};
const values = (extra: Record<string, unknown> = {}) => ({
  title: prefix,
  categoryId: root,
  subcategoryId: sub,
  quantity: "100",
  unit: "pcs",
  marginMode: "PERCENT_MARKUP",
  marginValue: "20",
  items: [
    {
      label: "Kertas",
      costType: "PAPER",
      quantity: "7",
      unitCost: "10000",
      fromPaperCut: true,
    },
    {
      label: "Tinta dan cetak",
      costType: "INK_PRINT",
      quantity: "1",
      unitCost: "430000",
    },
  ],
  paperCut: paper,
  ...extra,
});
async function create(extra: Record<string, unknown> = {}) {
  const row = await saveBudget(values(extra));
  budgetIds.push(row.id);
  return row;
}
async function order() {
  const row = await saveOrder({
    orderDate: "2026-11-03",
    customerName: `${prefix}-pelanggan`,
    categoryId: root,
    subcategoryId: sub,
    quantity: "100",
    unit: "pcs",
    unitPrice: "50000",
    status: "NEW",
  });
  orderIds.push(row.id);
  return row;
}
describe.skipIf(!url)(
  "HPP-01..05 / snapshot CUT persisten pada PostgreSQL TEST",
  () => {
    beforeAll(async () => {
      const a = await saveCategory({ name: `${prefix}-utama`, parentId: null });
      root = a.id;
      categoryIds.push(root);
      const b = await saveCategory({ name: `${prefix}-sub`, parentId: root });
      sub = b.id;
      categoryIds.push(sub);
      const c = await saveCategory({ name: `${prefix}-lain`, parentId: null });
      other = c.id;
      categoryIds.push(other);
    });
    afterAll(async () => {
      const db = getDb();
      await db.budgetEstimate.deleteMany({ where: { id: { in: budgetIds } } });
      await db.printOrder.deleteMany({ where: { id: { in: orderIds } } });
      await db.productCategory.deleteMany({
        where: { id: { in: categoryIds }, parentId: { not: null } },
      });
      await db.productCategory.deleteMany({
        where: { id: { in: categoryIds } },
      });
      await db.$disconnect();
    });
    it("HPP-01..03/CUT-01..03/07: simpan seluruh baris dan snapshot kedua orientasi; baca dari koneksi baru", async () => {
      const o = await order(),
        row = await create({ orderId: o.id });
      expect(row).toMatchObject({
        totalHpp: "500000",
        hppPerUnit: "5000.0000",
        suggestedSellingTotal: "600000",
        suggestedSellingPerUnit: "6000.0000",
        orderNumberSnapshot: o.orderNumber,
      });
      expect(row.items).toHaveLength(2);
      expect(row.paperSnapshot?.calculation.original).toMatchObject({
        columns: "4",
        rows: "3",
        yield: "12",
        remainingLengthCm: "3",
        remainingWidthCm: "18.5",
        wasteAreaCm2: "2164",
      });
      expect(row.paperSnapshot?.calculation.rotated).toMatchObject({
        columns: "5",
        rows: "3",
        yield: "15",
        wasteAreaCm2: "565",
      });
      expect(row.paperSnapshot?.material).toMatchObject({
        requiredParentSheets: "7",
        totalCost: "70000",
        extraPieces: "5",
      });
      const fresh = createDatabaseClient(url!);
      try {
        const stored = await fresh.budgetEstimate.findUniqueOrThrow({
          where: { id: row.id },
          include: { costItems: true, paperCut: true },
        });
        expect(stored.totalHpp.toFixed(0)).toBe("500000");
        expect(stored.paperCut!.chosenYield.toFixed(0)).toBe("15");
        expect(stored.paperCut!.calculationSnapshot).toEqual(row.paperSnapshot);
        expect(stored.costItems).toHaveLength(2);
      } finally {
        await fresh.$disconnect();
      }
      expect((await getBudget(row.id)).paperSnapshot).toEqual(
        row.paperSnapshot,
      );
    });
    it("simulasi saja tidak menambah komponen; HPP-04 nominal dan edit atomik mengganti baris, bukan menumpuk", async () => {
      let row = await create({ items: [] });
      expect(row.totalHpp).toBe("0");
      expect(row.items).toHaveLength(0);
      expect(row.paperSnapshot?.material?.totalCost).toBe("70000");
      row = await saveBudget(
        {
          data: values({ marginMode: "FIXED_AMOUNT", marginValue: "100000" }),
          updatedAt: row.updatedAt,
        },
        row.id,
      );
      expect(row).toMatchObject({
        totalHpp: "500000",
        suggestedSellingTotal: "600000",
        costCount: 2,
      });
      row = await saveBudget(
        {
          data: values({
            items: [
              {
                label: "Finishing",
                costType: "FINISHING",
                quantity: "2",
                unitCost: "250000",
              },
            ],
            paperCut: null,
          }),
          updatedAt: row.updatedAt,
        },
        row.id,
      );
      expect(row.costCount).toBe(1);
      expect(row.items[0].costType).toBe("FINISHING");
      expect(row.paperSnapshot).toBeNull();
      expect(
        await getDb().paperCutSimulation.count({ where: { budgetId: row.id } }),
      ).toBe(0);
    });
    it("HPP-05/KAS-04: create/edit/delete budget tidak mengubah kas, dashboard, harga/status pesanan", async () => {
      const o = await order(),
        before = await getDashboard(),
        cashBefore = await getDb().cashTransaction.count();
      let row = await create({ orderId: o.id });
      row = await saveBudget(
        {
          data: values({ orderId: o.id, marginValue: "50" }),
          updatedAt: row.updatedAt,
        },
        row.id,
      );
      await deleteBudget(row.id, { updatedAt: row.updatedAt });
      expect(await getDb().cashTransaction.count()).toBe(cashBefore);
      const after = await getDashboard();
      expect(after.finance).toEqual(before.finance);
      const stored = await getDb().printOrder.findUniqueOrThrow({
        where: { id: o.id },
      });
      expect(stored.totalPrice.toFixed(0)).toBe("5000000");
      expect(stored.status).toBe("NEW");
      expect(
        (
          await getDb().budgetEstimate.findUniqueOrThrow({
            where: { id: row.id },
          })
        ).deletedAt,
      ).not.toBeNull();
      expect(
        await getDb().budgetCostItem.count({ where: { budgetId: row.id } }),
      ).toBe(2);
      expect(
        await getDb().paperCutSimulation.count({ where: { budgetId: row.id } }),
      ).toBe(1);
      await expect(getBudget(row.id)).rejects.toMatchObject({ status: 404 });
    });
    it("SEC/HPP-05: stale update/delete dan race edit menghindari campuran snapshot/komponen", async () => {
      let row = await create();
      const stale = row.updatedAt;
      row = await saveBudget(
        { data: values({ title: `${prefix}-ubah` }), updatedAt: stale },
        row.id,
      );
      await expect(
        deleteBudget(row.id, { updatedAt: stale }),
      ).rejects.toMatchObject({ status: 409 });
      const a = values({
          title: `${prefix}-race-A`,
          items: [
            { label: "A", costType: "CUSTOM", quantity: "1", unitCost: "123" },
          ],
          paperCut: null,
        }),
        b = values({ title: `${prefix}-race-B`, marginValue: "50" });
      const results = await Promise.allSettled([
        saveBudget({ data: a, updatedAt: row.updatedAt }, row.id),
        saveBudget({ data: b, updatedAt: row.updatedAt }, row.id),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const stored = await getBudget(row.id),
        winner = results.find((r) => r.status === "fulfilled")!;
      if (winner.status === "fulfilled") {
        expect(stored.title).toBe(winner.value.title);
        expect(stored.items.map((i) => i.label)).toEqual(
          winner.value.items.map((i) => i.label),
        );
        expect(stored.paperSnapshot).toEqual(winner.value.paperSnapshot);
        expect(stored.totalHpp).toBe(winner.value.totalHpp);
      }
    });
    it("invalid jumlah/parent/order/total spoof dan biaya bahan stale tidak menimpa snapshot lama", async () => {
      const row = await create(),
        o = await order();
      for (const data of [
        values({ quantity: "0" }),
        values({ totalHpp: "1" }),
        values({ paperCut: { ...paper, chosenYield: 999 } }),
        values({
          items: [
            {
              label: "Palsu",
              costType: "PAPER",
              quantity: "8",
              unitCost: "10000",
              fromPaperCut: true,
            },
          ],
        }),
      ])
        await expect(
          saveBudget({ data, updatedAt: row.updatedAt }, row.id),
        ).rejects.toThrow();
      await expect(create({ categoryId: other })).rejects.toMatchObject({
        status: 422,
      });
      await expect(
        create({ categoryId: sub, subcategoryId: null }),
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        create({ orderId: o.id, categoryId: other, subcategoryId: null }),
      ).rejects.toMatchObject({ status: 422 });
      expect((await getBudget(row.id)).paperSnapshot).toEqual(
        row.paperSnapshot,
      );
      expect((await getBudget(row.id)).updatedAt).toBe(row.updatedAt);
    });
    it("snapshot nama stabil setelah rename/arsip; delete pesanan melepas tautan tetapi histori tetap ada", async () => {
      const c = await saveCategory({
        name: `${prefix}-history`,
        parentId: null,
      });
      categoryIds.push(c.id);
      let row = await create({
        categoryId: c.id,
        subcategoryId: null,
        items: [],
        paperCut: null,
      });
      await saveCategory({ name: `${prefix}-renamed`, parentId: null }, c.id);
      await deleteCategory(c.id);
      row = await saveBudget(
        {
          data: values({
            categoryId: c.id,
            subcategoryId: null,
            items: [],
            paperCut: null,
          }),
          updatedAt: row.updatedAt,
        },
        row.id,
      );
      expect(row.productNameSnapshot).toBe(`${prefix}-history`);
      await expect(
        create({ categoryId: c.id, subcategoryId: null }),
      ).rejects.toMatchObject({ status: 422 });
      const o = await order(),
        linked = await create({ orderId: o.id });
      await removeOrder(o.id, { updatedAt: o.updatedAt });
      const unlinked = await getBudget(linked.id);
      expect(unlinked).toMatchObject({
        orderId: null,
        orderNumberSnapshot: o.orderNumber,
        customerNameSnapshot: o.customerName,
      });
      expect(unlinked.paperSnapshot).toEqual(linked.paperSnapshot);
    });
    it("filter AND, literal wildcard, pagination dan batas tanggal WIB inklusif", async () => {
      for (let i = 0; i < 12; i++) {
        const row = await create({
          title: `${prefix}-filter 100%_é`,
          items: [],
          paperCut: null,
        });
        await getDb().budgetEstimate.update({
          where: { id: row.id },
          data: {
            createdAt: new Date(
              i === 0 ? "2026-10-31T17:00:00Z" : "2026-11-30T16:59:59.999Z",
            ),
          },
        });
      }
      await create({
        title: `${prefix}-filter 100XXé`,
        items: [],
        paperCut: null,
      });
      const f = parseBudgetFilters({
        q: `${prefix}-filter 100%_é`,
        categoryId: root,
        subcategoryId: sub,
        start: "2026-11-01",
        end: "2026-11-30",
        page: 2,
        pageSize: 10,
      });
      const list = await listBudgets(f);
      expect(list.total).toBe(12);
      expect(list.rows).toHaveLength(2);
      expect(
        (
          await listBudgets({
            ...f,
            start: "2026-11-30",
            end: "2026-11-30",
            page: 1,
          })
        ).total,
      ).toBe(11);
      expect(
        (
          await listBudgets({
            ...f,
            categoryId: other,
            subcategoryId: undefined,
          })
        ).total,
      ).toBe(0);
    });
    it("yield nol dapat disimpan tanpa material; hasil besar dan per-unit presisi bertahan di DB", async () => {
      const zero = await create({
        paperCut: {
          ...paper,
          sheetLengthCm: "10",
          sheetWidthCm: "10",
          material: null,
        },
        items: [],
      });
      expect(zero.paperSnapshot?.calculation.original.yield).toBe("0");
      await expect(
        create({
          paperCut: { ...paper, sheetLengthCm: "10", sheetWidthCm: "10" },
        }),
      ).rejects.toThrow();
      const huge = await create({
        quantity: "0.001",
        marginValue: "0",
        items: [
          {
            label: "Bahan",
            costType: "CUSTOM",
            quantity: "1",
            unitCost: "999999999999999999",
          },
        ],
        paperCut: {
          sheetLengthCm: "9999999999.99",
          sheetWidthCm: "9999999999.99",
          cutLengthCm: "0.01",
          cutWidthCm: "0.01",
          selectedOrientation: "original",
          material: null,
        },
      });
      const stored = await getBudget(huge.id);
      expect(stored.hppPerUnit).toBe("999999999999999999000.0000");
      expect(stored.paperSnapshot?.calculation.original.yield).toBe(
        "999999999998000000000001",
      );
      const p = await getDb().paperCutSimulation.findUniqueOrThrow({
        where: { budgetId: huge.id },
      });
      expect(p.chosenYield.toFixed(0)).toBe("999999999998000000000001");
    });
    it("baris fleksibel tanpa batas jumlah semu: 150 komponen tersimpan lengkap dalam urutan", async () => {
      const items = Array.from({ length: 150 }, (_, i) => ({
        label: `Komponen ${i + 1}`,
        costType: "CUSTOM",
        quantity: "1",
        unitCost: "1000",
      }));
      const row = await create({ items, paperCut: null, marginValue: "0" });
      expect(row.items).toHaveLength(150);
      expect(row.items[149].label).toBe("Komponen 150");
      expect(row.totalHpp).toBe("150000");
    });
  },
);
