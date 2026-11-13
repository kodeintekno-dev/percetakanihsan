import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import {
  cashSchema,
  createCashSchema,
  parseCashFilters,
  openingSchema,
  type CashRow,
} from "@/features/cash/schema";
import { cashCsv, cashXlsx } from "@/features/cash/export";
import { currentMonthJakarta, todayJakarta } from "@/lib/date";
const other = {
  type: "INCOME",
  incomeKind: "OTHER",
  description: "Pemasukan lain",
  amount: "100000",
};
describe("Validasi kas dan periode WIB", () => {
  it("tanggal default WIB; pergantian bulan, tahun, kabisat dihitung menurut Jakarta", () => {
    expect(cashSchema.parse(other).transactionDate).toBe(todayJakarta());
    expect(currentMonthJakarta(new Date("2026-10-31T17:00:00Z"))).toMatchObject(
      { start: "2026-11-01", end: "2026-11-30" },
    );
    expect(currentMonthJakarta(new Date("2026-12-31T17:00:00Z"))).toMatchObject(
      { start: "2027-01-01", end: "2027-01-31" },
    );
    expect(currentMonthJakarta(new Date("2024-02-10T00:00:00Z")).end).toBe(
      "2024-02-29",
    );
  });
  it.each(["0", "-1", "1.5", "NaN", "1000000000000000000"])(
    "jumlah %s ditolak",
    (amount) => {
      expect(cashSchema.safeParse({ ...other, amount }).success).toBe(false);
    },
  );
  it("validasi silang mencegah pos pada pemasukan, data penjualan pada pengeluaran, tanggal palsu, dan saldo negatif", () => {
    for (const input of [
      { ...other, expensePostId: "p" },
      { type: "EXPENSE", description: "Beli", amount: "1" },
      {
        type: "EXPENSE",
        description: "Beli",
        amount: "1",
        expensePostId: "p",
        incomeKind: "SALE",
      },
      { ...other, categoryId: "c" },
      { ...other, transactionDate: "2026-02-30" },
    ])
      expect(cashSchema.safeParse(input).success).toBe(false);
    expect(
      openingSchema.safeParse({
        openingDate: "2026-01-01",
        openingAmount: "-1",
        updatedAt: null,
      }).success,
    ).toBe(false);
    expect(
      createCashSchema.safeParse({ data: other, requestKey: "x" }).success,
    ).toBe(false);
  });
  it("SALE membedakan kuantitas belum diketahui dan nol eksplisit, satuan wajib berpasangan", () => {
    const sale = { ...other, incomeKind: "SALE", categoryId: "c" };
    expect(cashSchema.parse(sale).soldQuantity).toBeNull();
    expect(
      cashSchema.parse({ ...sale, soldQuantity: "0", soldUnit: "pcs" })
        .soldQuantity,
    ).toBe("0");
    expect(
      cashSchema.parse({ ...sale, soldQuantity: "1,125", soldUnit: "m" })
        .soldQuantity,
    ).toBe("1.125");
    expect(cashSchema.safeParse({ ...sale, soldQuantity: "1" }).success).toBe(
      false,
    );
    expect(
      cashSchema.safeParse({ ...sale, soldQuantity: "-1", soldUnit: "pcs" })
        .success,
    ).toBe(false);
  });
  it("pengeluaran boleh terkait pesanan tanpa data penjualan; pemasukan OTHER tetap tidak boleh", () => {
    const expense = {
      type: "EXPENSE",
      description: "Kertas pesanan pelanggan",
      amount: "400000",
      expensePostId: "p",
    };
    expect(cashSchema.parse(expense).orderId).toBeNull();
    expect(cashSchema.parse({ ...expense, orderId: "order-1" }).orderId).toBe(
      "order-1",
    );
    for (const extra of [
      { incomeKind: "SALE" },
      { categoryId: "c" },
      { subcategoryId: "s" },
      { soldQuantity: "1", soldUnit: "pcs" },
    ])
      expect(
        cashSchema.safeParse({ ...expense, orderId: "order-1", ...extra })
          .success,
      ).toBe(false);
    expect(cashSchema.safeParse({ ...other, orderId: "order-1" }).success).toBe(
      false,
    );
  });
  it("rentang terbalik, parameter ganda dan pagination palsu ditolak", () => {
    expect(() =>
      parseCashFilters({ start: "2026-11-03", end: "2026-11-01" }),
    ).toThrow();
    expect(() =>
      parseCashFilters(new URLSearchParams("type=INCOME&type=EXPENSE")),
    ).toThrow();
    expect(() => parseCashFilters({ pageSize: 11 })).toThrow();
  });
});
const row: CashRow = {
  id: "kas-é",
  transactionDate: "2026-11-03",
  type: "INCOME",
  description: '=HYPERLINK("https://example.test")\nBaris, é',
  amount: "999999999999999999",
  expensePostId: null,
  expensePostName: null,
  expenseGroupSnapshot: null,
  incomeKind: "SALE",
  categoryId: "c",
  subcategoryId: null,
  categoryNameSnapshot: "@Kategori",
  productNameSnapshot: "+Produk",
  orderId: null,
  orderNumber: null,
  orderCustomerName: null,
  soldQuantity: null,
  soldUnit: null,
  updatedAt: "2026-11-03T00:00:00Z",
};
describe("Ekspor kas nyata dan aman", () => {
  it("CSV BOM, Unicode, quote/newline dan formula injection; nol tidak disamakan dengan kuantitas kosong", () => {
    const csv = cashCsv([
      row,
      {
        ...row,
        id: "nol",
        description: "  +SUM(1,2)",
        soldQuantity: "0.000",
        soldUnit: "pcs",
      },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const rows = parse(csv, { bom: true, columns: true }) as Record<
      string,
      string
    >[];
    expect(rows[0].Keterangan).toBe(`'${row.description}`);
    expect(rows[0]["Jumlah (Rp)"]).toBe(row.amount);
    expect(rows[0]["Kuantitas Terjual"]).toBe("");
    expect(rows[1]["Kuantitas Terjual"]).toBe("0.000");
    expect(rows[1].Keterangan.startsWith("'")).toBe(true);
    expect(rows[0].Kategori).toBe("'@Kategori");
  });
  it("XLSX teks tidak menjadi formula, nominal 18 digit presisi utuh, angka kecil tetap numerik; ekspor kosong valid", async () => {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      Uint8Array.from(
        await cashXlsx(
          [row, { ...row, amount: "1200000", soldQuantity: "0.000" }],
          parseCashFilters({}),
        ),
      ).buffer,
    );
    const sheet = book.getWorksheet("Buku Kas")!;
    expect(sheet.getCell("D2").type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell("D2").value).toBe(row.description);
    expect(sheet.getCell("E2").value).toBe(row.amount);
    expect(sheet.getCell("E3").value).toBe(1200000);
    expect(sheet.getCell("L2").value).toBeNull();
    expect(sheet.getCell("L3").value).toBe(0);
    const empty = new ExcelJS.Workbook();
    await empty.xlsx.load(
      Uint8Array.from(await cashXlsx([], parseCashFilters({}))).buffer,
    );
    expect(empty.getWorksheet("Buku Kas")!.rowCount).toBe(1);
  });
});
