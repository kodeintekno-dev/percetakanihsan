import { beforeEach, afterEach, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import {
  createInvoice,
  getInvoice,
  recordPayment,
  voidPayment,
  editInvoice,
  cancelInvoice,
  listInvoices,
  paymentCandidates,
} from "@/features/trade/service";
import { parseTradeFilters } from "@/features/trade/schema";
import {
  createCash,
  editCash,
  deleteCash,
  getOrderAllocation,
} from "@/features/cash/service";
import { getFinancialSummary as summary } from "@/features/cash/aggregates";
const getFinancialSummary = (period: { start: string; end: string }) =>
  summary(period.start, period.end);
import { removeOrder, saveOrder } from "@/features/orders/service";
import { createAsset } from "@/features/assets/service";
import { allInvoiceExport } from "@/features/trade/export-data";
import { getReport } from "@/features/reports/service";
import { tradeCsv, tradeXlsx } from "@/features/trade/export";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
const url = process.env.TEST_DATABASE_URL;
if (url && url === process.env.DATABASE_URL)
  throw new Error("Database uji harus terpisah.");
if (url) process.env.DATABASE_URL = url;
describe.skipIf(!url)("Hutang-Piutang: tagihan, kas dan konsistensi", () => {
  let postId = "",
    categoryId = "",
    orderId = "",
    prefix = "";
  const invoiceIds: string[] = [],
    cashIds: string[] = [];
  const period = { start: "2020-01-01", end: "2020-12-31" };
  beforeEach(async () => {
    const db = getDb();
    prefix = randomUUID();
    const category = await db.productCategory.create({
      data: { name: prefix, nameKey: prefix },
    });
    categoryId = category.id;
    const post = await db.expensePost.create({
      data: { name: prefix, nameKey: prefix, group: "PRODUCTION" },
    });
    postId = post.id;
    const order = await db.printOrder.create({
      data: {
        orderNumber: prefix,
        orderDate: new Date("2020-01-05T00:00:00Z"),
        customerName: "Pelanggan QA",
        categoryId,
        categoryNameSnapshot: prefix,
        productNameSnapshot: prefix,
        quantity: "10",
        unit: "lembar",
        unitPrice: "200000",
        totalPrice: "2000000",
      },
    });
    orderId = order.id;
  });
  afterEach(async () => {
    const db = getDb();
    const payments = await db.tradePayment.findMany({
      where: { invoiceId: { in: invoiceIds } },
    });
    cashIds.push(...payments.map((p) => p.cashId));
    await db.tradePayment.deleteMany({
      where: { invoiceId: { in: invoiceIds } },
    });
    await db.tradeInvoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await db.cashTransaction.deleteMany({ where: { id: { in: cashIds } } });
    await db.printOrder.deleteMany({ where: { id: orderId } });
    await db.expensePost.deleteMany({ where: { id: postId } });
    await db.productCategory.deleteMany({ where: { id: categoryId } });
    invoiceIds.length = 0;
    cashIds.length = 0;
  });
  afterAll(async () => {
    await getDb().$disconnect();
  });
  async function invoice(
    kind: "RECEIVABLE" | "PAYABLE" = "RECEIVABLE",
    extra: Record<string, unknown> = {},
  ) {
    const id = randomUUID();
    invoiceIds.push(id);
    await createInvoice({
      id,
      kind,
      reference: prefix + "-" + invoiceIds.length,
      partyName: "Pemasok QA",
      issueDate: "2020-01-05",
      dueDate: "2020-01-20",
      amount: kind === "RECEIVABLE" ? "2000000" : "1500000",
      orderId: kind === "RECEIVABLE" ? orderId : null,
      expensePostId: kind === "PAYABLE" ? postId : null,
      ...extra,
    });
    return getInvoice(id);
  }
  async function newPay(
    id: string,
    updatedAt: string,
    amount: string,
    key = randomUUID(),
  ) {
    return recordPayment(id, {
      mode: "NEW",
      id: key,
      updatedAt,
      amount,
      transactionDate: "2020-01-10",
      notes: "QA bayar",
    });
  }
  async function legacyCash(ar = true, amount = "200000") {
    const row = (
      await createCash({
        requestKey: randomUUID(),
        data: {
          type: ar ? "INCOME" : "EXPENSE",
          incomeKind: ar ? "SALE" : null,
          categoryId: ar ? categoryId : null,
          orderId: ar ? orderId : null,
          expensePostId: ar ? null : postId,
          amount,
          description: prefix + " DP lama",
          transactionDate: "2020-01-02",
        },
      })
    ).row;
    cashIds.push(row.id);
    return row;
  }
  it("pembuatan tagihan tidak mengubah kas; DP lama dan angsuran baru dihitung sekali sampai lunas", async () => {
    const before = await getFinancialSummary(period);
    let r = await invoice();
    expect((await getFinancialSummary(period)).net).toBe(before.net);
    expect(r.partyName).toBe("Pelanggan QA");
    const dp = await legacyCash();
    const beforeLink = await getFinancialSummary(period);
    await recordPayment(r.id, {
      mode: "LINK",
      id: randomUUID(),
      updatedAt: r.updatedAt,
      cashId: dp.id,
    });
    r = await getInvoice(r.id);
    expect(r.remaining).toBe("1800000");
    expect((await getFinancialSummary(period)).net).toBe(beforeLink.net);
    const requestId = randomUUID();
    await newPay(r.id, r.updatedAt, "800000", requestId);
    await newPay(r.id, r.updatedAt, "800000", requestId);
    r = await getInvoice(r.id);
    expect(r.paidAmount).toBe("1000000");
    expect(r.status).toBe("PARTIAL");
    await expect(newPay(r.id, r.updatedAt, "1000001")).rejects.toMatchObject({
      status: 422,
    });
    await newPay(r.id, r.updatedAt, "1000000");
    r = await getInvoice(r.id);
    expect(r.status).toBe("PAID");
    expect(r.remaining).toBe("0");
    expect(
      BigInt((await getFinancialSummary(period)).net) - BigInt(before.net),
    ).toBe(2000000n);
    expect((await getOrderAllocation(orderId)).allocatedQuantity).toBe("0.000");
  });
  it("hutang pemasok memotong kas pada pembayaran saja, memakai kelompok biaya yang disimpan", async () => {
    const before = await getFinancialSummary(period);
    let r = await invoice("PAYABLE");
    expect((await getFinancialSummary(period)).expense).toBe(before.expense);
    await getDb().expensePost.update({
      where: { id: postId },
      data: { group: "MARKETING", isActive: false },
    });
    await newPay(r.id, r.updatedAt, "500000");
    r = await getInvoice(r.id);
    expect(r.remaining).toBe("1000000");
    expect(r.payments[0].createdCash).toBe(true);
    await newPay(r.id, r.updatedAt, "1000000");
    const after = await getFinancialSummary(period);
    expect(BigInt(after.expense) - BigInt(before.expense)).toBe(1500000n);
    expect(
      BigInt(after.groups.PRODUCTION) - BigInt(before.groups.PRODUCTION),
    ).toBe(1500000n);
  });
  it("mencegah pengubahan/penghapusan kas, penggantian pesanan, piutang ganda, dan tautan aset", async () => {
    let r = await invoice();
    await expect(invoice()).rejects.toMatchObject({ status: 409 });
    await newPay(r.id, r.updatedAt, "500000");
    r = await getInvoice(r.id);
    const cash = await getDb().cashTransaction.findUniqueOrThrow({
      where: { id: r.payments[0].cashId },
    });
    await expect(
      deleteCash(cash.id, { updatedAt: cash.updatedAt.toISOString() }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      editCash(cash.id, {
        updatedAt: cash.updatedAt.toISOString(),
        data: {
          type: "INCOME",
          incomeKind: "SALE",
          categoryId,
          orderId,
          description: "edit",
          amount: "1",
          transactionDate: "2020-01-10",
        },
      }),
    ).rejects.toMatchObject({ status: 409 });
    const order = await getDb().printOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    await expect(
      removeOrder(orderId, { updatedAt: order.updatedAt.toISOString() }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      saveOrder(
        {
          updatedAt: order.updatedAt.toISOString(),
          data: {
            orderDate: "2020-01-05",
            customerName: "Pelanggan QA",
            categoryId,
            subcategoryId: null,
            quantity: "11",
            unit: "lembar",
            unitPrice: "200000",
            status: "NEW",
          },
        },
        orderId,
      ),
    ).rejects.toMatchObject({ status: 409 });
    let ap = await invoice("PAYABLE");
    await newPay(ap.id, ap.updatedAt, "500000");
    ap = await getInvoice(ap.id);
    await expect(
      createAsset({
        id: randomUUID(),
        name: "QA Aset",
        acquisitionCost: "500000",
        startDate: "2020-01-10",
        usefulMonths: 12,
        purchaseCashId: ap.payments[0].cashId,
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("pembatalan pembayaran baru mengoreksi kas; pelepasan pembayaran lama tidak mengubah kas dan dapat ditautkan lagi", async () => {
    let r = await invoice();
    const dp = await legacyCash();
    await recordPayment(r.id, {
      mode: "LINK",
      id: randomUUID(),
      updatedAt: r.updatedAt,
      cashId: dp.id,
    });
    r = await getInvoice(r.id);
    const before = await getFinancialSummary(period);
    const dpPayment = r.payments[0];
    await voidPayment(r.id, dpPayment.id, {
      updatedAt: r.updatedAt,
      reason: "Salah tautan",
    });
    r = await getInvoice(r.id);
    expect(r.paidAmount).toBe("0");
    expect((await getFinancialSummary(period)).net).toBe(before.net);
    expect(r.payments[0].voidReason).toBe("Salah tautan");
    await recordPayment(r.id, {
      mode: "LINK",
      id: randomUUID(),
      updatedAt: r.updatedAt,
      cashId: dp.id,
    });
    r = await getInvoice(r.id);
    await newPay(r.id, r.updatedAt, "500000");
    r = await getInvoice(r.id);
    const payment = r.payments.find((p) => p.createdCash)!;
    await voidPayment(r.id, payment.id, {
      updatedAt: r.updatedAt,
      reason: "Nominal salah",
    });
    r = await getInvoice(r.id);
    expect(r.paidAmount).toBe("200000");
    expect((await getFinancialSummary(period)).net).toBe(before.net);
    expect(
      (
        await getDb().cashTransaction.findUniqueOrThrow({
          where: { id: payment.cashId },
        })
      ).deletedAt,
    ).not.toBeNull();
  });
  it("menolak uang yang tidak cocok dan tidak mengizinkan satu kas aktif ditautkan ke dua tagihan", async () => {
    const a = await invoice("PAYABLE"),
      b = await invoice("PAYABLE");
    const cash = await legacyCash(false);
    const results = await Promise.allSettled(
      [a, b].map((r) =>
        recordPayment(r.id, {
          mode: "LINK",
          id: randomUUID(),
          updatedAt: r.updatedAt,
          cashId: cash.id,
        }),
      ),
    );
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(
      await getDb().tradePayment.count({
        where: { cashId: cash.id, voidedAt: null },
      }),
    ).toBe(1);
    const ar = await invoice();
    await expect(
      recordPayment(ar.id, {
        mode: "LINK",
        id: randomUUID(),
        updatedAt: ar.updatedAt,
        cashId: cash.id,
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("menangani pengiriman ulang dan pembayaran bersamaan tanpa kas ganda", async () => {
    let r = await invoice();
    const id = randomUUID();
    const duplicate = await Promise.all([
      newPay(r.id, r.updatedAt, "500000", id),
      newPay(r.id, r.updatedAt, "500000", id),
    ]);
    expect(duplicate.map((x) => x.replayed).sort()).toEqual([false, true]);
    r = await getInvoice(r.id);
    expect(r.payments).toHaveLength(1);
    const outcomes = await Promise.allSettled([
      newPay(r.id, r.updatedAt, "800000"),
      newPay(r.id, r.updatedAt, "800000"),
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    r = await getInvoice(r.id);
    expect(r.paidAmount).toBe("1300000");
    expect(r.payments).toHaveLength(2);
  });
  it("koreksi dan pembatalan menjaga revisi, pembayaran, filter, dan riwayat", async () => {
    let r = await invoice("PAYABLE");
    const initial = r;
    await newPay(r.id, r.updatedAt, "500000");
    r = await getInvoice(r.id);
    const edit = {
      reference: r.reference,
      partyName: r.partyName,
      issueDate: r.issueDate,
      dueDate: r.dueDate,
      amount: "400000",
      notes: "",
      updatedAt: r.updatedAt,
    };
    await expect(editInvoice(r.id, edit)).rejects.toMatchObject({
      status: 422,
    });
    await expect(
      cancelInvoice(r.id, { updatedAt: r.updatedAt, reason: "Batal" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      editInvoice(r.id, {
        ...edit,
        amount: "1500000",
        updatedAt: initial.updatedAt,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await editInvoice(r.id, {
      ...edit,
      amount: "1000000",
      dueDate: "2020-01-25",
    });
    r = await getInvoice(r.id);
    expect(r.remaining).toBe("500000");
    const page = await listInvoices(
      parseTradeFilters({ kind: "PAYABLE", q: prefix, status: "PARTIAL" }),
    );
    expect(page.total).toBe(1);
    expect(page.summary.remaining).toBe("500000");
    const detail = await getInvoice(r.id);
    await voidPayment(r.id, detail.payments[0].id, {
      updatedAt: r.updatedAt,
      reason: "Batal pesanan",
    });
    r = await getInvoice(r.id);
    await cancelInvoice(r.id, {
      updatedAt: r.updatedAt,
      reason: "Tagihan salah",
    });
    r = await getInvoice(r.id);
    expect(r.status).toBe("CANCELLED");
    expect((await getInvoice(r.id)).payments).toHaveLength(1);
    expect(
      (await listInvoices(parseTradeFilters({ kind: "PAYABLE", q: prefix })))
        .total,
    ).toBe(0);
    expect(
      (
        await listInvoices(
          parseTradeFilters({
            kind: "PAYABLE",
            q: prefix,
            status: "CANCELLED",
          }),
        )
      ).total,
    ).toBe(1);
  });
  it("pencarian pembayaran lama hanya menawarkan transaksi sesuai dan belum tertaut", async () => {
    const r = await invoice();
    const dp = await legacyCash();
    await legacyCash(false);
    const result = await paymentCandidates(r.id, prefix, 1);
    expect(result.rows.map((x) => x.id)).toEqual([dp.id]);
    await recordPayment(r.id, {
      mode: "LINK",
      id: randomUUID(),
      updatedAt: r.updatedAt,
      cashId: dp.id,
    });
    expect((await paymentCandidates(r.id, prefix, 1)).total).toBe(0);
  });
  it("pembuatan tagihan bersamaan idempoten dan tanggal koreksi tetap sesuai pesanan", async () => {
    const id = randomUUID();
    invoiceIds.push(id);
    const payload = {
      id,
      kind: "RECEIVABLE",
      reference: prefix,
      amount: "2000000",
      issueDate: "2020-01-05",
      dueDate: "2020-01-20",
      orderId,
    };
    const rows = await Promise.all([
      createInvoice(payload),
      createInvoice(payload),
    ]);
    expect(rows[0].id).toBe(rows[1].id);
    expect(await getDb().tradeInvoice.count({ where: { id } })).toBe(1);
    await expect(
      createInvoice({ ...payload, reference: prefix + "-changed" }),
    ).rejects.toMatchObject({ status: 409 });
    const row = rows[0];
    await expect(
      editInvoice(id, {
        reference: row.reference,
        partyName: row.partyName,
        amount: row.amount,
        issueDate: "2020-01-04",
        dueDate: row.dueDate,
        notes: "",
        updatedAt: row.updatedAt,
      }),
    ).rejects.toMatchObject({ status: 422 });
    const order = await getDb().printOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    await expect(
      saveOrder(
        {
          updatedAt: order.updatedAt.toISOString(),
          data: {
            orderDate: "2020-01-06",
            customerName: order.customerName,
            categoryId,
            subcategoryId: null,
            quantity: "10",
            unit: "lembar",
            unitPrice: "200000",
            status: "NEW",
          },
        },
        orderId,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("ekspor menyertakan semua halaman hasil filter dan riwayat pembayaran yang dibatalkan", async () => {
    const rows = [];
    for (let i = 0; i < 27; i++) rows.push(await invoice("PAYABLE"));
    const filters = parseTradeFilters({
      kind: "PAYABLE",
      q: prefix,
      status: "OPEN",
      page: 2,
    });
    expect((await listInvoices(filters)).rows).toHaveLength(2);
    expect((await allInvoiceExport(filters)).invoices).toHaveLength(27);
    let row = rows[0];
    await newPay(row.id, row.updatedAt, "500000");
    row = await getInvoice(row.id);
    await voidPayment(row.id, row.payments[0].id, {
      updatedAt: row.updatedAt,
      reason: "Salah nominal",
    });
    row = await getInvoice(row.id);
    await newPay(row.id, row.updatedAt, "600000");
    const exported = await allInvoiceExport(
      parseTradeFilters({ kind: "PAYABLE", q: prefix, status: "PARTIAL" }),
    );
    expect(exported.invoices).toHaveLength(1);
    expect(exported.payments).toHaveLength(2);
    expect(exported.invoices[0].remaining).toBe("900000");
    const csv = parse(tradeCsv(exported), {
      bom: true,
      columns: true,
    }) as Record<string, string>[];
    expect(
      csv.filter(
        (r: Record<string, string>) => r.status_pembayaran === "Aktif",
      ),
    ).toHaveLength(1);
    expect(
      csv.find(
        (r: Record<string, string>) =>
          r.status_pembayaran === "Pembayaran dibatalkan",
      )?.alasan_pembatalan_pembayaran,
    ).toBe("Salah nominal");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      Uint8Array.from(await tradeXlsx(exported, filters)).buffer,
    );
    expect(book.getWorksheet("Tagihan")!.getCell("J2").value).toBe(900000);
  });
  it("laporan menghitung posisi akhir periode dari tanggal kas, membawa tagihan lama, dan tidak memasukkan pembayaran masa depan", async () => {
    let ar = await invoice();
    const dp = await legacyCash(true, "200000");
    await recordPayment(ar.id, {
      mode: "LINK",
      id: randomUUID(),
      updatedAt: ar.updatedAt,
      cashId: dp.id,
    });
    ar = await getInvoice(ar.id);
    await recordPayment(ar.id, {
      mode: "NEW",
      id: randomUUID(),
      updatedAt: ar.updatedAt,
      amount: "1800000",
      transactionDate: "2020-02-01",
    });
    const ap = await invoice("PAYABLE");
    await invoice("PAYABLE", {
      issueDate: "2020-02-01",
      dueDate: "2020-02-20",
    });
    const jan = await getReport({ mode: "month", year: 2020, month: 1 }),
      feb = await getReport({ mode: "month", year: 2020, month: 2 });
    expect(jan.trade.invoices.find((r) => r.id === ar.id)).toMatchObject({
      paidAmount: "200000",
      remaining: "1800000",
      status: "PARTIAL",
    });
    expect(jan.trade.receivableRemaining).toBe("1800000");
    expect(jan.trade.payableRemaining).toBe("1500000");
    expect(jan.trade.payments.map((p) => p.cashId)).toEqual([dp.id]);
    expect(feb.trade.invoices.find((r) => r.id === ar.id)).toMatchObject({
      remaining: "0",
      status: "PAID",
    });
    expect(feb.trade.payableRemaining).toBe("3000000");
    expect(feb.trade.payments).toHaveLength(1);
    expect(feb.trade.payments[0].transactionDate).toBe("2020-02-01");
    const cashBefore = jan.finance;
    await editInvoice(ap.id, {
      updatedAt: ap.updatedAt,
      reference: ap.reference,
      partyName: ap.partyName,
      amount: ap.amount,
      issueDate: ap.issueDate,
      dueDate: "2020-01-25",
      notes: "Koreksi jatuh tempo",
    });
    const revised = await getReport({ mode: "month", year: 2020, month: 1 });
    expect(revised.finance).toEqual(cashBefore);
    expect(revised.revision).not.toBe(jan.revision);
  });
});
