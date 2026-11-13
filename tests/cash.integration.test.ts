import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { getDb } from "@/lib/db";
import { saveCategory, deleteCategory } from "@/features/categories/service";
import { saveExpense, deleteExpense } from "@/features/expenses/service";
import { saveOrder, getOrder, removeOrder } from "@/features/orders/service";
import {
  createCash,
  editCash,
  deleteCash,
  getCash,
  getOpeningSettings,
  saveOpening,
  listCash,
  allFilteredCash,
  getOrderAllocation,
} from "@/features/cash/service";
import { getFinancialSummary, getDashboard } from "@/features/cash/aggregates";
import { parseCashFilters } from "@/features/cash/schema";
import { cashCsv, cashXlsx } from "@/features/cash/export";
import type { CashOpeningSetting } from "@/generated/prisma/client";
const url = process.env.TEST_DATABASE_URL;
if (url && url === process.env.DATABASE_URL)
  throw new Error("Database pengujian harus terpisah.");
if (url) process.env.DATABASE_URL = url;
const prefix = `kas-${randomUUID().slice(0, 8)}`,
  cashIds: string[] = [],
  orderIds: string[] = [],
  budgetIds: string[] = [],
  categoryIds: string[] = [],
  postIds: string[] = [];
let root: string,
  sub: string,
  other: string,
  production: string,
  operational: string,
  marketing: string,
  original: CashOpeningSetting | null;
const values = (extra: Record<string, unknown> = {}) => ({
  transactionDate: "2020-11-03",
  type: "INCOME",
  incomeKind: "OTHER",
  description: prefix,
  amount: "100000",
  ...extra,
});
const sale = (extra: Record<string, unknown> = {}) =>
  values({
    incomeKind: "SALE",
    categoryId: root,
    subcategoryId: sub,
    ...extra,
  });
const expense = (extra: Record<string, unknown> = {}) => ({
  transactionDate: "2020-11-03",
  type: "EXPENSE",
  description: prefix,
  amount: "400000",
  expensePostId: production,
  ...extra,
});
const orderValues = (extra: Record<string, unknown> = {}) => ({
  orderDate: "2020-11-03",
  customerName: prefix,
  categoryId: root,
  subcategoryId: sub,
  quantity: "100",
  unit: "pcs",
  unitPrice: "50000",
  status: "NEW",
  ...extra,
});
async function create(data: unknown = values(), requestKey = randomUUID()) {
  const result = await createCash({ data, requestKey });
  if (!cashIds.includes(result.row.id)) cashIds.push(result.row.id);
  return result.row;
}
async function order(extra: Record<string, unknown> = {}) {
  const result = await saveOrder(orderValues(extra));
  orderIds.push(result.id);
  return result;
}
async function clean() {
  const db = getDb();
  await db.cashTransaction.deleteMany({ where: { id: { in: cashIds } } });
  await db.budgetEstimate.deleteMany({ where: { id: { in: budgetIds } } });
  await db.printOrder.deleteMany({ where: { id: { in: orderIds } } });
  cashIds.length = orderIds.length = budgetIds.length = 0;
}
describe.skipIf(!url)("KAS-01..09 / FR-01 pada PostgreSQL TEST", () => {
  beforeAll(async () => {
    const db = getDb();
    original = await db.cashOpeningSetting.findUnique({ where: { id: 1 } });
    expect(
      await db.cashTransaction.count({
        where: {
          transactionDate: {
            gte: new Date("2020-11-01"),
            lte: new Date("2020-12-31"),
          },
        },
      }),
    ).toBe(0);
    for (const parentId of [null, "child", null]) {
      const c = await saveCategory({
        name: `${prefix}-${categoryIds.length}`,
        parentId: parentId ? categoryIds[0] : null,
      });
      categoryIds.push(c.id);
    }
    [root, sub, other] = categoryIds;
    for (const group of ["PRODUCTION", "OPERATIONAL", "MARKETING"]) {
      const p = await saveExpense({ name: `${prefix}-${group}`, group });
      postIds.push(p.id);
    }
    [production, operational, marketing] = postIds;
  });
  beforeEach(async () => {
    await getDb().cashOpeningSetting.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        openingDate: new Date("2020-11-01"),
        openingAmount: "2000000",
        isConfigured: true,
      },
      update: {
        openingDate: new Date("2020-11-01"),
        openingAmount: "2000000",
        isConfigured: true,
      },
    });
  });
  afterEach(clean);
  afterAll(async () => {
    await clean();
    const db = getDb();
    if (original)
      await db.cashOpeningSetting.upsert({
        where: { id: 1 },
        create: original,
        update: original,
      });
    else await db.cashOpeningSetting.deleteMany({ where: { id: 1 } });
    await db.productCategory.deleteMany({
      where: { id: { in: categoryIds }, parentId: { not: null } },
    });
    await db.productCategory.deleteMany({ where: { id: { in: categoryIds } } });
    await db.expensePost.deleteMany({ where: { id: { in: postIds } } });
    await db.$disconnect();
  });
  it("KAS-04: pesanan 5 juta dan estimasi HPP 3 juta tidak menciptakan kas", async () => {
    const o = await order();
    expect(o.totalPrice).toBe("5000000");
    const b = await getDb().budgetEstimate.create({
      data: {
        budgetNumber: prefix,
        orderId: o.id,
        title: prefix,
        quantity: "100",
        unit: "pcs",
        marginMode: "PERCENT_MARKUP",
        marginValue: "20",
        totalHpp: "3000000",
        hppPerUnit: "30000",
        suggestedSellingTotal: "3600000",
      },
    });
    budgetIds.push(b.id);
    const f = await getFinancialSummary("2020-11-01", "2020-11-30");
    expect(f).toMatchObject({
      income: "0",
      expense: "0",
      net: "0",
      count: 0,
      openingBalance: "2000000",
      closingBalance: "2000000",
    });
  });
  it("KAS-01/02/05: sale + other, tiga snapshot beban, saldo 2 juta → 2,6 juta dan carry forward", async () => {
    await create(sale({ amount: "1200000" }));
    await create(values());
    await create(expense());
    await create(expense({ expensePostId: operational, amount: "200000" }));
    await create(expense({ expensePostId: marketing, amount: "100000" }));
    expect(await getFinancialSummary("2020-11-01", "2020-11-30")).toMatchObject(
      {
        income: "1300000",
        expense: "700000",
        net: "600000",
        openingBalance: "2000000",
        closingBalance: "2600000",
        groups: {
          PRODUCTION: "400000",
          OPERATIONAL: "200000",
          MARKETING: "100000",
        },
      },
    );
    expect(await getFinancialSummary("2020-12-01", "2020-12-31")).toMatchObject(
      {
        income: "0",
        expense: "0",
        net: "0",
        count: 0,
        openingBalance: "2600000",
        closingBalance: "2600000",
      },
    );
  });
  it("KAS-06: bulan WIB, antrean Diproses lintas tanggal, edit/hapus mengubah statistik aktual", async () => {
    const before = await getDashboard(new Date("2020-10-31T17:00:00Z"));
    await order();
    await order({ orderDate: "2020-10-01", status: "IN_PROGRESS" });
    const current = await order({ status: "IN_PROGRESS" });
    const c = await create(values({ amount: "1300000" }));
    const e = await create(expense({ amount: "2000000" }));
    let d = await getDashboard(new Date("2020-10-31T17:00:00Z"));
    expect(d.orderCount).toBe(2);
    expect(d.processingCount).toBe(before.processingCount + 2);
    expect(d.finance.net).toBe("-700000");
    await editCash(e.id, {
      data: expense({ amount: "700000" }),
      updatedAt: e.updatedAt,
    });
    await deleteCash(c.id, { updatedAt: c.updatedAt });
    await removeOrder(current.id, { updatedAt: current.updatedAt });
    d = await getDashboard(new Date("2020-11-15T00:00:00Z"));
    expect(d.orderCount).toBe(1);
    expect(d.processingCount).toBe(before.processingCount + 1);
    expect(d.finance).toMatchObject({
      income: "0",
      expense: "700000",
      net: "-700000",
      closingBalance: "1300000",
    });
  });
  it("KAS-07: UUID idempoten, replay paralel satu record; payload berbeda/terhapus ditolak", async () => {
    const key = randomUUID();
    const both = await Promise.all([
      createCash({ data: values(), requestKey: key }),
      createCash({ data: values(), requestKey: key }),
    ]);
    cashIds.push(both[0].row.id);
    expect(both[0].row.id).toBe(both[1].row.id);
    expect(both.filter((v) => v.replayed).length).toBe(1);
    expect((await getFinancialSummary("2020-11-01", "2020-11-30")).income).toBe(
      "100000",
    );
    await expect(
      createCash({ data: values({ amount: "2" }), requestKey: key }),
    ).rejects.toMatchObject({ status: 409 });
    await deleteCash(both[0].row.id, { updatedAt: both[0].row.updatedAt });
    await expect(
      createCash({ data: values(), requestKey: key }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getFinancialSummary("2020-11-01", "2020-11-30")).income).toBe(
      "0",
    );
  });
  it("KAS-07: revisi stale mencegah edit/hapus menimpa sesi lain; soft-delete tetap tersimpan", async () => {
    const c = await create();
    const edited = await editCash(c.id, {
      data: values({ amount: "125000" }),
      updatedAt: c.updatedAt,
    });
    await expect(
      editCash(c.id, { data: values(), updatedAt: c.updatedAt }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      deleteCash(c.id, { updatedAt: c.updatedAt }),
    ).rejects.toMatchObject({ status: 409 });
    await deleteCash(c.id, { updatedAt: edited.updatedAt });
    await expect(getCash(c.id)).rejects.toMatchObject({ status: 404 });
    expect(
      (await getDb().cashTransaction.findUniqueOrThrow({ where: { id: c.id } }))
        .deletedAt,
    ).not.toBeNull();
  });
  it("saldo pembukaan terpisah, belum konfigurasi tidak diasumsikan nol, periode sebelum pembukaan jelas", async () => {
    await getDb().cashOpeningSetting.update({
      where: { id: 1 },
      data: { isConfigured: false },
    });
    expect((await getOpeningSettings()).opening).toBeNull();
    expect(await getFinancialSummary("2020-11-01", "2020-11-30")).toMatchObject(
      {
        balanceStatus: "NOT_CONFIGURED",
        openingBalance: null,
        closingBalance: null,
      },
    );
    await saveOpening({
      openingDate: "2020-11-02",
      openingAmount: "0",
      updatedAt: null,
      acknowledge: true,
    });
    expect(await getFinancialSummary("2020-11-01", "2020-11-30")).toMatchObject(
      { balanceStatus: "BEFORE_OPENING", openingBalance: null },
    );
    expect(await getFinancialSummary("2020-11-02", "2020-11-30")).toMatchObject(
      {
        balanceStatus: "READY",
        openingBalance: "0",
        closingBalance: "0",
        count: 0,
      },
    );
    await expect(
      create(values({ transactionDate: "2020-11-01" })),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("perubahan pembukaan memerlukan konfirmasi/revisi, tidak boleh mengecualikan transaksi awal", async () => {
    await create();
    const old = (await getOpeningSettings()).opening!;
    await expect(
      saveOpening({
        openingDate: "2020-11-01",
        openingAmount: "1",
        updatedAt: old.updatedAt,
      }),
    ).rejects.toMatchObject({
      status: 422,
      fields: { acknowledge: expect.any(Array) },
    });
    await expect(
      saveOpening({
        openingDate: "2020-11-04",
        openingAmount: "1",
        updatedAt: old.updatedAt,
        acknowledge: true,
      }),
    ).rejects.toMatchObject({ status: 422 });
    const changed = await saveOpening({
      openingDate: "2020-11-01",
      openingAmount: "3000000",
      updatedAt: old.updatedAt,
      acknowledge: true,
    });
    expect(changed.openingAmount).toBe("3000000");
    await expect(
      saveOpening({
        openingDate: "2020-11-01",
        openingAmount: "2",
        updatedAt: old.updatedAt,
        acknowledge: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await getFinancialSummary("2020-11-01", "2020-11-30")).closingBalance,
    ).toBe("3100000");
  });
  it("POS/CAT regresi: snapshot stabil setelah master diubah/diarsip; pemakaian baru arsip ditolak", async () => {
    const p = await saveExpense({
      name: `${prefix}-history`,
      group: "PRODUCTION",
    });
    postIds.push(p.id);
    let c = await create(expense({ expensePostId: p.id }));
    await saveExpense({ name: `${prefix}-renamed`, group: "MARKETING" }, p.id);
    await deleteExpense(p.id);
    c = await editCash(c.id, {
      data: expense({ expensePostId: p.id, description: "Koreksi keterangan" }),
      updatedAt: c.updatedAt,
    });
    expect(c.expenseGroupSnapshot).toBe("PRODUCTION");
    expect(c.expensePostName).toBe(`${prefix}-renamed`);
    await expect(
      create(expense({ expensePostId: p.id })),
    ).rejects.toMatchObject({ status: 422 });
    c = await editCash(c.id, {
      data: expense({ expensePostId: marketing }),
      updatedAt: c.updatedAt,
    });
    expect(c.expenseGroupSnapshot).toBe("MARKETING");
    const category = await saveCategory({
      name: `${prefix}-archive`,
      parentId: null,
    });
    categoryIds.push(category.id);
    const s = await create(
      sale({ categoryId: category.id, subcategoryId: null }),
    );
    await saveCategory(
      { name: `${prefix}-rename-cat`, parentId: null },
      category.id,
    );
    await deleteCategory(category.id);
    expect(
      (
        await editCash(s.id, {
          data: sale({ categoryId: category.id, subcategoryId: null }),
          updatedAt: s.updatedAt,
        })
      ).productNameSnapshot,
    ).toBe(`${prefix}-archive`);
    await expect(
      create(sale({ categoryId: category.id, subcategoryId: null })),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("KAS-01: kategori/sub pesanan, pos aktif dan satuan divalidasi server", async () => {
    const o = await order();
    await expect(
      create(sale({ orderId: o.id, categoryId: other })),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      create(sale({ orderId: o.id, soldQuantity: "1", soldUnit: "meter" })),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      create(sale({ categoryId: sub, subcategoryId: null })),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      create(expense({ expensePostId: "missing" })),
    ).rejects.toMatchObject({ status: 422 });
    const unknown = await create(sale({ orderId: o.id }));
    expect(unknown.soldQuantity).toBeNull();
    expect(unknown.orderNumber).toBe(o.orderNumber);
  });
  it("pengeluaran dapat ditautkan, diganti pesanannya, dibuka ulang, dan dilepas tanpa mengubah alokasi penjualan", async () => {
    const first = await order();
    const second = await order({ categoryId: other, subcategoryId: null });
    const original = await create(expense());
    let linked = await editCash(original.id, {
      data: expense({ orderId: first.id }),
      updatedAt: original.updatedAt,
    });
    expect(await getCash(linked.id)).toMatchObject({
      orderId: first.id,
      orderNumber: first.orderNumber,
      orderCustomerName: first.customerName,
      expensePostId: production,
      expenseGroupSnapshot: "PRODUCTION",
      amount: "400000",
      categoryId: null,
      soldQuantity: null,
    });
    expect((await getOrderAllocation(first.id)).allocatedQuantity).toBe("0.000");
    linked = await editCash(linked.id, {
      data: expense({ orderId: second.id }),
      updatedAt: linked.updatedAt,
    });
    const rows = await allFilteredCash(parseCashFilters({ type: "EXPENSE" }));
    expect(rows.find((row) => row.id === linked.id)?.orderNumber).toBe(
      second.orderNumber,
    );
    const csv = parse(cashCsv(rows), { bom: true, columns: true }) as Record<
      string,
      string
    >[];
    expect(
      csv.find((row) => row["Kode Transaksi"] === linked.id)?.Pesanan,
    ).toBe(second.orderNumber);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      Uint8Array.from(await cashXlsx(rows, parseCashFilters({}))).buffer,
    );
    expect(book.getWorksheet("Buku Kas")!.getCell("K2").value).toBe(
      second.orderNumber,
    );
    linked = await editCash(linked.id, {
      data: expense(),
      updatedAt: linked.updatedAt,
    });
    expect(linked.orderId).toBeNull();
    const created = await create(expense({ orderId: first.id }));
    expect(created.orderId).toBe(first.id);
    expect(await getFinancialSummary("2020-11-01", "2020-11-30")).toMatchObject({
      income: "0",
      expense: "800000",
      count: 2,
      closingBalance: "1200000",
    });
  });
  it("pesanan hilang/terhapus ditolak pada pengeluaran; hapus pesanan mempertahankan transaksi pengeluaran", async () => {
    await expect(create(expense({ orderId: "missing" }))).rejects.toMatchObject({
      status: 422,
      fields: { orderId: expect.any(Array) },
    });
    const o = await order();
    const linked = await create(expense({ orderId: o.id }));
    await removeOrder(o.id, { updatedAt: o.updatedAt });
    expect(await getCash(linked.id)).toMatchObject({
      orderId: null,
      amount: "400000",
      expensePostId: production,
    });
    await expect(create(expense({ orderId: o.id }))).rejects.toMatchObject({
      status: 422,
    });
  });
  it("constraint database tetap menolak data penjualan pada pengeluaran terkait pesanan", async () => {
    const o = await order();
    const linked = await create(expense({ orderId: o.id }));
    await expect(
      getDb().cashTransaction.update({
        where: { id: linked.id },
        data: { soldQuantity: "1", soldUnit: "pcs" },
      }),
    ).rejects.toThrow();
    expect((await getCash(linked.id)).soldQuantity).toBeNull();
  });
  it("KAS-09: DP nol + pelunasan 100 tidak mengganda; edit mengecualikan diri sendiri; hapus melepas alokasi", async () => {
    const o = await order();
    await create(
      sale({
        orderId: o.id,
        amount: "200000",
        soldQuantity: "0",
        soldUnit: "pcs",
      }),
    );
    let paid = await create(
      sale({
        orderId: o.id,
        amount: "4800000",
        soldQuantity: "100",
        soldUnit: "PCS",
      }),
    );
    expect(await getOrderAllocation(o.id)).toMatchObject({
      allocatedQuantity: "100.000",
      remainingQuantity: "0.000",
    });
    await expect(
      create(sale({ orderId: o.id, soldQuantity: "1", soldUnit: "pcs" })),
    ).rejects.toMatchObject({ status: 422 });
    paid = await editCash(paid.id, {
      data: sale({
        orderId: o.id,
        soldQuantity: "100",
        soldUnit: "pcs",
        description: "Lunas",
      }),
      updatedAt: paid.updatedAt,
    });
    expect(paid.soldQuantity).toBe("100.000");
    await expect(
      saveOrder(
        { data: orderValues({ quantity: "99" }), updatedAt: o.updatedAt },
        o.id,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      saveOrder(
        { data: orderValues({ unit: "meter" }), updatedAt: o.updatedAt },
        o.id,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await deleteCash(paid.id, { updatedAt: paid.updatedAt });
    expect((await getOrderAllocation(o.id)).remainingQuantity).toBe("100.000");
  });
  it("KAS-09: dua alokasi bersamaan tidak dapat melampaui jumlah pesanan", async () => {
    const o = await order();
    const results = await Promise.allSettled([
      create(sale({ orderId: o.id, soldQuantity: "60", soldUnit: "pcs" })),
      create(sale({ orderId: o.id, soldQuantity: "60", soldUnit: "pcs" })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await getOrderAllocation(o.id)).allocatedQuantity).toBe("60.000");
  });
  it("hapus pesanan tidak menghapus kas atau kuantitas yang sudah dicatat", async () => {
    const o = await order();
    const c = await create(
      sale({ orderId: o.id, soldQuantity: "100", soldUnit: "pcs" }),
    );
    await removeOrder(o.id, { updatedAt: (await getOrder(o.id)).updatedAt });
    const row = await getCash(c.id);
    expect(row).toMatchObject({
      orderId: null,
      soldQuantity: "100.000",
      amount: "100000",
    });
    expect((await getFinancialSummary("2020-11-01", "2020-11-30")).income).toBe(
      "100000",
    );
  });
  it("KAS-03/08: filter AND, batas inklusif, literal wildcard, seluruh 12 hasil di ekspor bukan satu page", async () => {
    for (let i = 0; i < 12; i++)
      await create(
        expense({
          description: `=SUM(1,2) ${prefix} 100%_é`,
          transactionDate: i === 0 ? "2020-11-01" : "2020-11-30",
        }),
      );
    await create(expense({ description: `${prefix} 100XXé` }));
    await create(values());
    const f = parseCashFilters({
      q: "100%_é",
      type: "EXPENSE",
      expensePostId: production,
      start: "2020-11-01",
      end: "2020-11-30",
      page: 2,
      pageSize: 10,
    });
    const page = await listCash(f),
      all = await allFilteredCash(f);
    expect(page.rows).toHaveLength(2);
    expect(page.total).toBe(12);
    expect(page.totals.expense).toBe("4800000");
    expect(all).toHaveLength(12);
    const csv = parse(cashCsv(all), { bom: true, columns: true }) as Record<
      string,
      string
    >[];
    expect(csv).toHaveLength(12);
    expect(csv.every((r) => r.Keterangan.startsWith("'="))).toBe(true);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Uint8Array.from(await cashXlsx(all, f)).buffer);
    expect(book.getWorksheet("Buku Kas")!.rowCount).toBe(13);
    expect(book.getWorksheet("Buku Kas")!.getCell("D2").type).toBe(
      ExcelJS.ValueType.String,
    );
    expect((await listCash({ ...f, type: "INCOME" })).total).toBe(0);
  });
  it("Decimal 18 digit tetap akurat pada penjumlahan di atas presisi JS", async () => {
    await create(values({ amount: "999999999999999999" }));
    await create(values({ amount: "1" }));
    await create(expense({ amount: "999999999999999998" }));
    expect(await getFinancialSummary("2020-11-01", "2020-11-30")).toMatchObject(
      {
        income: "1000000000000000000",
        expense: "999999999999999998",
        net: "2",
        closingBalance: "2000002",
      },
    );
  });
});
