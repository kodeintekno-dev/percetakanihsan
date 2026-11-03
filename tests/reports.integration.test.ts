import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
} from "vitest";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { getDb } from "@/lib/db";
import { saveCategory, deleteCategory } from "@/features/categories/service";
import { saveExpense } from "@/features/expenses/service";
import { saveOrder, removeOrder } from "@/features/orders/service";
import { saveBudget } from "@/features/budget/service";
import { createCash, editCash, deleteCash } from "@/features/cash/service";
import { getDashboard } from "@/features/cash/aggregates";
import {
  parseReportFilters,
  type ReportFilters,
} from "@/features/reports/schema";
import { getReport } from "@/features/reports/service";
import { reportsCsv, reportsXlsx } from "@/features/reports/export";
import type { CashOpeningSetting } from "@/generated/prisma/client";
const url = process.env.TEST_DATABASE_URL;
if (url && url === process.env.DATABASE_URL)
  throw new Error("Database TEST harus berbeda dari database aplikasi.");
if (url) process.env.DATABASE_URL = url;
const prefix = `rpt-${randomUUID().slice(0, 8)}`,
  cashIds: string[] = [],
  orderIds: string[] = [],
  budgetIds: string[] = [],
  categoryIds: string[] = [],
  postIds: string[] = [];
let root: string,
  sub: string,
  production: string,
  operational: string,
  marketing: string,
  original: CashOpeningSetting | null;
let openingLoaded = false;
const period: ReportFilters = { mode: "month", year: 2021, month: 11 };
const other = (extra: Record<string, unknown> = {}) => ({
  transactionDate: "2021-11-03",
  type: "INCOME",
  incomeKind: "OTHER",
  description: prefix,
  amount: "100000",
  ...extra,
});
const sale = (extra: Record<string, unknown> = {}) =>
  other({ incomeKind: "SALE", categoryId: root, subcategoryId: sub, ...extra });
const expense = (extra: Record<string, unknown> = {}) => ({
  transactionDate: "2021-11-03",
  type: "EXPENSE",
  expensePostId: production,
  description: prefix,
  amount: "400000",
  ...extra,
});
async function cash(data: unknown) {
  const { row } = await createCash({ data, requestKey: randomUUID() });
  cashIds.push(row.id);
  return row;
}
async function clean() {
  const db = getDb();
  await db.cashTransaction.deleteMany({ where: { id: { in: cashIds } } });
  await db.budgetEstimate.deleteMany({ where: { id: { in: budgetIds } } });
  await db.printOrder.deleteMany({ where: { id: { in: orderIds } } });
  cashIds.length = budgetIds.length = orderIds.length = 0;
}
async function fixture() {
  const a = await saveOrder({
      orderDate: "2021-11-02",
      customerName: `${prefix}-belum-bayar`,
      categoryId: root,
      subcategoryId: sub,
      quantity: "100",
      unit: "pcs",
      unitPrice: "50000",
      status: "NEW",
    }),
    b = await saveOrder({
      orderDate: "2021-11-03",
      customerName: `${prefix}-dibayar`,
      categoryId: root,
      subcategoryId: sub,
      quantity: "100",
      unit: "pcs",
      unitPrice: "12000",
      status: "COMPLETED",
    });
  orderIds.push(a.id, b.id);
  const budget = await saveBudget({
    title: prefix,
    orderId: a.id,
    categoryId: root,
    subcategoryId: sub,
    quantity: "100",
    unit: "pcs",
    marginMode: "PERCENT_MARKUP",
    marginValue: "20",
    items: [
      {
        label: "Estimasi bahan",
        costType: "PAPER",
        quantity: "1",
        unitCost: "3000000",
      },
    ],
    paperCut: null,
  });
  budgetIds.push(budget.id);
  expect(
    await getDb().cashTransaction.count({
      where: {
        transactionDate: {
          gte: new Date("2021-11-01"),
          lte: new Date("2021-11-30"),
        },
      },
    }),
  ).toBe(0);
  const dp = await cash(
      sale({
        orderId: b.id,
        amount: "480000",
        soldQuantity: "0",
        soldUnit: "pcs",
      }),
    ),
    paid = await cash(
      sale({
        orderId: b.id,
        amount: "720000",
        soldQuantity: "100",
        soldUnit: "pcs",
      }),
    ),
    misc = await cash(other()),
    p = await cash(expense()),
    o = await cash(expense({ expensePostId: operational, amount: "200000" })),
    m = await cash(expense({ expensePostId: marketing, amount: "100000" }));
  return { a, b, dp, paid, misc, p, o, m };
}
describe.skipIf(!url)("RPT-01..10 pada PostgreSQL TEST nyata", () => {
  beforeAll(async () => {
    const db = getDb();
    original = await db.cashOpeningSetting.findUnique({ where: { id: 1 } });
    openingLoaded = true;
    expect(
      await db.cashTransaction.count({
        where: {
          transactionDate: {
            gte: new Date("2021-10-01"),
            lte: new Date("2021-12-31"),
          },
        },
      }),
    ).toBe(0);
    root = (await saveCategory({ name: `${prefix}-utama`, parentId: null })).id;
    categoryIds.push(root);
    sub = (await saveCategory({ name: `${prefix}-produk`, parentId: root })).id;
    categoryIds.push(sub);
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
        openingDate: new Date("2021-11-01"),
        openingAmount: "2000000",
        isConfigured: true,
      },
      update: {
        openingDate: new Date("2021-11-01"),
        openingAmount: "2000000",
        isConfigured: true,
      },
    });
  });
  afterEach(clean);
  afterAll(async () => {
    await clean();
    const db = getDb();
    if (openingLoaded && original)
      await db.cashOpeningSetting.upsert({
        where: { id: 1 },
        create: original,
        update: original,
      });
    else if (openingLoaded)
      await db.cashOpeningSetting.deleteMany({ where: { id: 1 } });
    await db.productCategory.deleteMany({
      where: { id: { in: categoryIds }, parentId: { not: null } },
    });
    await db.productCategory.deleteMany({ where: { id: { in: categoryIds } } });
    await db.expensePost.deleteMany({ where: { id: { in: postIds } } });
    await db.$disconnect();
  });
  it("RPT-02/03/04/05/06/07: rekonsiliasi penuh, pesanan/HPP tidak menjadi kas dan DP tidak mengganda", async () => {
    await fixture();
    const r = await getReport(period);
    expect(r.finance).toMatchObject({
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
    });
    expect(r.orderCount).toBe(2);
    expect(r.income).toMatchObject({
      saleAmount: "1200000",
      saleTransactionCount: 2,
      linkedOrderCount: 1,
      otherAmount: "100000",
      otherTransactionCount: 1,
    });
    expect(r.income.sales[0]).toMatchObject({
      transactionCount: 2,
      linkedOrderCount: 1,
      knownQuantityCount: 2,
      unknownQuantityCount: 0,
      quantities: [{ unit: "pcs", quantity: "100.000" }],
    });
    expect(r.posts.map((p) => p.amount)).toEqual([
      "400000",
      "200000",
      "100000",
    ]);
    expect(r.posts[0].percent).toBe("57.14");
    expect(r.daily[0]).toMatchObject({
      income: "1300000",
      expense: "700000",
      net: "600000",
      openingBalance: "2000000",
      closingBalance: "2600000",
    });
    expect(
      (await getDashboard(new Date("2021-11-03T05:00:00Z"))).finance,
    ).toEqual(r.finance);
  });
  it("RPT-01: hari awal/akhir inklusif dan month/range setara, transaksi luar periode hanya memengaruhi saldo awal", async () => {
    await getDb().cashOpeningSetting.update({
      where: { id: 1 },
      data: { openingDate: new Date("2021-10-01") },
    });
    await cash(other({ transactionDate: "2021-10-31", amount: "3" }));
    await cash(other({ transactionDate: "2021-11-01", amount: "1" }));
    await cash(other({ transactionDate: "2021-11-30", amount: "2" }));
    await cash(other({ transactionDate: "2021-12-01", amount: "4" }));
    const monthly = await getReport(period),
      range = await getReport(
        parseReportFilters({
          mode: "range",
          start: "2021-11-01",
          end: "2021-11-30",
        }),
      );
    expect(monthly.finance).toEqual(range.finance);
    expect(monthly.finance).toMatchObject({
      income: "3",
      openingBalance: "2000003",
      closingBalance: "2000006",
    });
    expect(
      (
        await getReport(
          parseReportFilters({ start: "2021-11-30", end: "2021-11-30" }),
        )
      ).finance.income,
    ).toBe("2");
  });
  it("RPT-04: satuan berbeda tetap terpisah, unknown tidak menjadi nol, count distinct pesanan bukan jumlah pembayaran", async () => {
    await fixture();
    await cash(sale({ amount: "500" }));
    await cash(sale({ amount: "700", soldQuantity: "2", soldUnit: "meter" }));
    await cash(sale({ amount: "300", soldQuantity: "0", soldUnit: "PCS" }));
    const r = await getReport(period),
      row = r.income.sales[0];
    expect(row).toMatchObject({
      transactionCount: 5,
      linkedOrderCount: 1,
      knownQuantityCount: 4,
      unknownQuantityCount: 1,
      amount: "1201500",
    });
    expect(row.quantities).toEqual([
      { unit: "meter", quantity: "2.000" },
      { unit: "pcs", quantity: "100.000" },
    ]);
    expect(r.income.otherAmount).toBe("100000");
  });
  it("RPT-09: bulan kosong tetap membawa saldo2,6 juta, semua bagian ekspor valid", async () => {
    await fixture();
    const r = await getReport({ mode: "month", year: 2021, month: 12 });
    expect(r.finance).toMatchObject({
      income: "0",
      expense: "0",
      net: "0",
      count: 0,
      openingBalance: "2600000",
      closingBalance: "2600000",
    });
    expect(r.orderCount).toBe(0);
    expect(r.income.sales).toHaveLength(0);
    expect(r.posts).toHaveLength(0);
    expect(r.daily).toHaveLength(0);
    const b = new ExcelJS.Workbook();
    await b.xlsx.load(Uint8Array.from(await reportsXlsx(r)).buffer);
    expect(b.worksheets).toHaveLength(5);
    expect(reportsCsv(r)).toContain("2600000");
  });
  it("RPT-06: pembukaan belum diatur / periode sebelum efektif tidak mengarang saldo nol", async () => {
    await fixture();
    await getDb().cashOpeningSetting.update({
      where: { id: 1 },
      data: { isConfigured: false },
    });
    const unset = await getReport(period);
    expect(unset.opening).toBeNull();
    expect(unset.finance).toMatchObject({
      income: "1300000",
      openingBalance: null,
      closingBalance: null,
      balanceStatus: "NOT_CONFIGURED",
    });
    expect(unset.daily[0].openingBalance).toBeNull();
    await getDb().cashOpeningSetting.update({
      where: { id: 1 },
      data: { isConfigured: true },
    });
    expect(
      (await getReport({ mode: "month", year: 2021, month: 10 })).finance,
    ).toMatchObject({
      balanceStatus: "BEFORE_OPENING",
      openingBalance: null,
      closingBalance: null,
    });
  });
  it("RPT-02/06: edit/hapus kas mengubah laporan, saldo dan revisi tanpa duplikasi", async () => {
    const f = await fixture(),
      before = await getReport(period);
    await editCash(f.p.id, {
      data: expense({ amount: "500000" }),
      updatedAt: f.p.updatedAt,
    });
    let r = await getReport(period);
    expect(r.revision).not.toBe(before.revision);
    expect(r.finance.closingBalance).toBe("2500000");
    await deleteCash(f.paid.id, { updatedAt: f.paid.updatedAt });
    r = await getReport(period);
    expect(r.finance).toMatchObject({
      income: "580000",
      expense: "800000",
      net: "-220000",
      closingBalance: "1780000",
    });
    expect(r.income.sales[0].quantities[0].quantity).toBe("0.000");
    await editCash(f.misc.id, {
      data: other({ transactionDate: "2021-12-01" }),
      updatedAt: f.misc.updatedAt,
    });
    expect((await getReport(period)).finance.income).toBe("480000");
    expect(
      (await getReport({ mode: "month", year: 2021, month: 12 })).finance,
    ).toMatchObject({ openingBalance: "1680000", closingBalance: "1780000" });
  });
  it("RPT-10: snapshot kelompok lama stabil setelah master dipindah, analitik pos menggabungkan nominal lintas kelompok", async () => {
    await fixture();
    await saveExpense(
      { name: `${prefix}-kertas-baru`, group: "MARKETING" },
      production,
    );
    let r = await getReport(period);
    expect(r.finance.groups.PRODUCTION).toBe("400000");
    expect(r.expenses.find((e) => e.postId === production)?.group).toBe(
      "PRODUCTION",
    );
    await cash(expense({ amount: "50000" }));
    r = await getReport(period);
    expect(r.finance.groups).toEqual({
      PRODUCTION: "400000",
      OPERATIONAL: "200000",
      MARKETING: "150000",
    });
    const post = r.posts.find((p) => p.postId === production)!;
    expect(post).toMatchObject({
      amount: "450000",
      percent: "60.00",
      groups: ["PRODUCTION", "MARKETING"],
    });
    await saveExpense(
      { name: `${prefix}-PRODUCTION`, group: "PRODUCTION" },
      production,
    );
  });
  it("RPT-04: nama kategori historis tetap setelah rename/arsip, penerimaan baru memakai snapshot baru", async () => {
    await fixture();
    await saveCategory({ name: `${prefix}-nama-baru`, parentId: null }, root);
    await saveCategory({ name: `${prefix}-produk-baru`, parentId: root }, sub);
    await cash(sale({ amount: "1000" }));
    await deleteCategory(root);
    const r = await getReport(period);
    expect(r.income.sales).toHaveLength(2);
    expect(
      r.income.sales.find((s) => s.amount === "1200000")!.productName,
    ).toBe(`${prefix}-produk`);
    expect(r.income.sales.find((s) => s.amount === "1000")!.productName).toBe(
      `${prefix}-produk-baru`,
    );
    await saveCategory(
      { name: `${prefix}-utama`, parentId: null, isActive: true },
      root,
    );
    await saveCategory(
      { name: `${prefix}-produk`, parentId: root, isActive: true },
      sub,
    );
  });
  it("RPT-08: CSV dan lima worksheet memakai nilai hasil DB, teks berbahaya bukan formula", async () => {
    await fixture();
    await saveCategory({ name: `=SUM(1,2) ${prefix}`, parentId: null }, root);
    await cash(sale({ amount: "1" }));
    await saveExpense(
      { name: `+Pos ${prefix}`, group: "PRODUCTION" },
      production,
    );
    const r = await getReport(period),
      csv = parse(reportsCsv(r), { bom: true, columns: true }) as Record<
        string,
        string
      >[];
    expect(
      csv.find(
        (row) => row.bagian === "ringkasan" && row.subbagian === "kas_masuk",
      )!.nominal,
    ).toBe(r.finance.income);
    expect(csv.some((row) => row.nama.startsWith("'=SUM"))).toBe(true);
    expect(
      csv.some(
        (row) => row.bagian === "analitik_pos" && row.nama.startsWith("'+Pos"),
      ),
    ).toBe(true);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Uint8Array.from(await reportsXlsx(r)).buffer);
    expect(book.worksheets.map((s) => s.name)).toEqual([
      "Ringkasan",
      "Pendapatan",
      "Pengeluaran",
      "Arus Kas",
      "Analitik Pos",
    ]);
    expect(book.getWorksheet("Ringkasan")!.getCell("C7").value).toBe(1300001);
    await saveCategory({ name: `${prefix}-utama`, parentId: null }, root);
    await saveExpense(
      { name: `${prefix}-PRODUCTION`, group: "PRODUCTION" },
      production,
    );
  });
  it("hapus pesanan melepas tautan, tetapi nominal/kuantitas pendapatan tetap tercatat", async () => {
    const f = await fixture();
    await removeOrder(f.b.id, { updatedAt: f.b.updatedAt });
    const r = await getReport(period);
    expect(r.orderCount).toBe(1);
    expect(r.income.linkedOrderCount).toBe(0);
    expect(r.income.sales[0].quantities[0].quantity).toBe("100.000");
    expect(r.finance.income).toBe("1300000");
  });
  it("revisi stabil saat data sama; nominal agregat di atas rentang JS tetap eksak di JSON/Excel", async () => {
    await cash(other({ amount: "999999999999999999" }));
    await cash(other({ amount: "999999999999999999" }));
    const a = await getReport(period),
      b = await getReport(period);
    expect(a.revision).toBe(b.revision);
    expect(a.finance.income).toBe("1999999999999999998");
    expect(a.finance.closingBalance).toBe(
      (1999999999999999998n + 2000000n).toString(),
    );
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Uint8Array.from(await reportsXlsx(a)).buffer);
    expect(book.getWorksheet("Ringkasan")!.getCell("C7").value).toBe(
      "1999999999999999998",
    );
  });
});
