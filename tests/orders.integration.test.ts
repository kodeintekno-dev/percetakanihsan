import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { getDb } from "@/lib/db";
import { saveCategory, deleteCategory } from "@/features/categories/service";
import {
  saveOrder,
  getOrder,
  listOrders,
  allFilteredOrders,
  changeOrderStatus,
  removeOrder,
} from "@/features/orders/service";
import { parseOrderFilters, type OrderRow } from "@/features/orders/schema";
import { ordersCsv, ordersXlsx } from "@/features/orders/export";
const url = process.env.TEST_DATABASE_URL;
if (url && url === process.env.DATABASE_URL)
  throw new Error("TEST_DATABASE_URL harus terpisah dari database aplikasi.");
if (url) process.env.DATABASE_URL = url;
const prefix = `ord-${randomUUID().slice(0, 8)}`;
const categoryIds: string[] = [],
  orderIds: string[] = [],
  cashIds: string[] = [],
  budgetIds: string[] = [];
let root: { id: string; name: string },
  child: { id: string; name: string },
  other: { id: string; name: string };
const values = (extra: Record<string, unknown> = {}) => ({
  orderDate: "2026-11-03",
  customerName: prefix,
  categoryId: root.id,
  subcategoryId: child.id,
  quantity: "250",
  unit: "pcs",
  unitPrice: "2000",
  status: "NEW",
  notes: "Cetak hijau, kertas é\nFinishing doff",
  ...extra,
});
async function create(extra: Record<string, unknown> = {}) {
  const row = await saveOrder(values(extra));
  orderIds.push(row.id);
  return row;
}
describe.skipIf(!url)("ORD-01..07 dan CAT regresi pada PostgreSQL TEST", () => {
  beforeAll(async () => {
    root = await saveCategory({ name: `${prefix}-utama`, parentId: null });
    categoryIds.push(root.id);
    child = await saveCategory({
      name: `${prefix}-subproduk`,
      parentId: root.id,
    });
    categoryIds.push(child.id);
    other = await saveCategory({ name: `${prefix}-lain`, parentId: null });
    categoryIds.push(other.id);
  });
  afterAll(async () => {
    const db = getDb();
    await db.cashTransaction.deleteMany({ where: { id: { in: cashIds } } });
    await db.budgetEstimate.deleteMany({ where: { id: { in: budgetIds } } });
    await db.printOrder.deleteMany({ where: { id: { in: orderIds } } });
    await db.productCategory.deleteMany({
      where: { id: { in: categoryIds }, parentId: { not: null } },
    });
    await db.productCategory.deleteMany({ where: { id: { in: categoryIds } } });
    await db.$disconnect();
  });
  it("ORD-01/02 create/read ulang/edit menghitung total server tanpa membuat uang kas", async () => {
    const cashBefore = await getDb().cashTransaction.count();
    const row = await create();
    expect(row.totalPrice).toBe("500000");
    expect(row.orderDate).toBe("2026-11-03");
    expect((await getOrder(row.id)).notes).toContain("Finishing");
    const edited = await saveOrder(
      { data: values({ quantity: "300" }), updatedAt: row.updatedAt },
      row.id,
    );
    expect(edited.totalPrice).toBe("600000");
    expect(
      (
        await getDb().printOrder.findUniqueOrThrow({ where: { id: row.id } })
      ).totalPrice.toFixed(0),
    ).toBe("600000");
    expect(await getDb().cashTransaction.count()).toBe(cashBefore);
  });
  it("ORD-03 status cepat persisten, stale update dan dua aksi bersamaan ditolak", async () => {
    let row = await create();
    const stale = row.updatedAt;
    for (const status of ["IN_PROGRESS", "COMPLETED", "PICKED_UP"] as const) {
      row = await changeOrderStatus(row.id, {
        status,
        updatedAt: row.updatedAt,
      });
      expect((await getOrder(row.id)).status).toBe(status);
    }
    await expect(
      changeOrderStatus(row.id, { status: "NEW", updatedAt: stale }),
    ).rejects.toMatchObject({ status: 409 });
    const race = await Promise.allSettled([
      changeOrderStatus(row.id, { status: "NEW", updatedAt: row.updatedAt }),
      changeOrderStatus(row.id, {
        status: "COMPLETED",
        updatedAt: row.updatedAt,
      }),
    ]);
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(race.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("ORD-05/06 gabungan filter dan ekspor seluruh 13 hasil walau tabel 10 baris", async () => {
    const selected: OrderRow[] = [];
    for (let i = 0; i < 13; i++)
      selected.push(
        await create({
          customerName: i === 0 ? `=${prefix}-filter` : `${prefix}-filter-${i}`,
          status: "IN_PROGRESS",
          orderDate: "2026-11-30",
        }),
      );
    await create({
      customerName: `${prefix}-filter-luar`,
      status: "IN_PROGRESS",
      orderDate: "2026-12-01",
    });
    await create({
      customerName: `${prefix}-filter-status`,
      status: "NEW",
      orderDate: "2026-11-30",
    });
    await create({
      customerName: `${prefix}-filter-kategori`,
      categoryId: other.id,
      subcategoryId: null,
      status: "IN_PROGRESS",
      orderDate: "2026-11-30",
    });
    const removed = await create({
      customerName: `${prefix}-filter-hapus`,
      status: "IN_PROGRESS",
      orderDate: "2026-11-30",
    });
    await removeOrder(removed.id, { updatedAt: removed.updatedAt });
    const filters = parseOrderFilters({
      q: `${prefix}-filter`,
      status: "IN_PROGRESS",
      categoryId: root.id,
      subcategoryId: child.id,
      start: "2026-11-30",
      end: "2026-11-30",
      page: "1",
      pageSize: "10",
    });
    const first = await listOrders(filters),
      second = await listOrders({ ...filters, page: 2 });
    expect(first.total).toBe(13);
    expect(first.rows).toHaveLength(10);
    expect(second.rows).toHaveLength(3);
    expect((await listOrders({ ...filters, page: 999 })).page).toBe(2);
    const all = await allFilteredOrders({ ...filters, page: 2 });
    expect(all.map((r) => r.id).sort()).toEqual(
      selected.map((r) => r.id).sort(),
    );
    const csv = parse(ordersCsv(all), { bom: true, columns: true }) as Record<
      string,
      string
    >[];
    expect(csv).toHaveLength(13);
    expect(csv.some((r) => r["Nama Pelanggan"] === `'=${prefix}-filter`)).toBe(
      true,
    );
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      Uint8Array.from(await ordersXlsx(all, filters)).buffer,
    );
    expect(book.getWorksheet("Permintaan")!.rowCount).toBe(14);
    expect(
      await allFilteredOrders(parseOrderFilters({ q: `${prefix}-no-match` })),
    ).toHaveLength(0);
  });
  it("pencarian memperlakukan persen dan garis bawah sebagai teks literal", async () => {
    const literal = await create({ customerName: `${prefix}-100%_spesial` });
    await create({ customerName: `${prefix}-100XXspesial` });
    const page = await listOrders(
      parseOrderFilters({ q: `${prefix}-100%_spesial` }),
    );
    expect(page.rows.map((row) => row.id)).toEqual([literal.id]);
  });
  it("ORD-07 validasi langsung menolak parent/sub mismatch, kategori asing/child dan spoof total", async () => {
    await expect(
      saveOrder(values({ categoryId: other.id })),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      saveOrder(values({ categoryId: "missing" })),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      saveOrder(values({ categoryId: child.id, subcategoryId: null })),
    ).rejects.toMatchObject({ status: 422 });
    await expect(saveOrder(values({ totalPrice: "1" }))).rejects.toThrow();
    await expect(
      listOrders(
        parseOrderFilters({ categoryId: other.id, subcategoryId: child.id }),
      ),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("CAT regresi: rename/arsip menjaga snapshot dan pencarian historis maupun nama master baru", async () => {
    const parent = await saveCategory({
      name: `${prefix}-historis`,
      parentId: null,
    });
    categoryIds.push(parent.id);
    const sub = await saveCategory({
      name: `${prefix}-produk-lama`,
      parentId: parent.id,
    });
    categoryIds.push(sub.id);
    const row = await create({ categoryId: parent.id, subcategoryId: sub.id });
    await saveCategory(
      { name: `${prefix}-nama-baru`, parentId: parent.id },
      sub.id,
    );
    expect(
      (
        await listOrders(parseOrderFilters({ q: `${prefix}-produk-lama` }))
      ).rows.some((r) => r.id === row.id),
    ).toBe(true);
    expect(
      (
        await listOrders(parseOrderFilters({ q: `${prefix}-nama-baru` }))
      ).rows.some((r) => r.id === row.id),
    ).toBe(true);
    expect((await deleteCategory(parent.id)).message).toContain("diarsipkan");
    await expect(
      saveOrder(values({ categoryId: parent.id, subcategoryId: sub.id })),
    ).rejects.toMatchObject({ status: 422 });
    const edited = await saveOrder(
      {
        data: values({
          categoryId: parent.id,
          subcategoryId: sub.id,
          quantity: "2",
        }),
        updatedAt: row.updatedAt,
      },
      row.id,
    );
    expect(edited.productNameSnapshot).toBe(sub.name);
    expect(
      (
        await listOrders(
          parseOrderFilters({ categoryId: parent.id, subcategoryId: sub.id }),
        )
      ).total,
    ).toBe(1);
  });
  it("ORD-04 soft-delete menyimpan histori dan melepas relasi tanpa mengubah kas/budget", async () => {
    const row = await create();
    const cash = await getDb().cashTransaction.create({
      data: {
        transactionDate: new Date("2026-11-03"),
        type: "INCOME",
        incomeKind: "SALE",
        description: "Fixture TEST",
        amount: 1000,
        categoryId: root.id,
        subcategoryId: child.id,
        categoryNameSnapshot: root.name,
        productNameSnapshot: child.name,
        orderId: row.id,
      },
    });
    cashIds.push(cash.id);
    const budget = await getDb().budgetEstimate.create({
      data: {
        budgetNumber: `${prefix}-budget`,
        title: "Fixture TEST",
        orderId: row.id,
        categoryId: root.id,
        quantity: 250,
        unit: "pcs",
        marginMode: "FIXED_AMOUNT",
        marginValue: 0,
        totalHpp: 300,
        hppPerUnit: "1.2",
        suggestedSellingTotal: 300,
      },
    });
    budgetIds.push(budget.id);
    await expect(
      saveOrder(
        {
          data: values({ categoryId: other.id, subcategoryId: null }),
          updatedAt: row.updatedAt,
        },
        row.id,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getOrder(row.id)).incomeCount).toBe(1);
    const result = await removeOrder(row.id, { updatedAt: row.updatedAt });
    expect(result.budgetCount).toBe(1);
    expect(
      (await getDb().printOrder.findUniqueOrThrow({ where: { id: row.id } }))
        .deletedAt,
    ).not.toBeNull();
    await expect(getOrder(row.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      changeOrderStatus(row.id, { status: "NEW", updatedAt: row.updatedAt }),
    ).rejects.toMatchObject({ status: 404 });
    const preserved = await getDb().cashTransaction.findUniqueOrThrow({
      where: { id: cash.id },
    });
    expect(preserved.amount.toFixed()).toBe("1000");
    expect(preserved.orderId).toBeNull();
    expect(preserved.productNameSnapshot).toBe(child.name);
    const preservedBudget = await getDb().budgetEstimate.findUniqueOrThrow({
      where: { id: budget.id },
    });
    expect(preservedBudget.totalHpp.toFixed()).toBe("300");
    expect(preservedBudget.orderId).toBeNull();
  });
});
