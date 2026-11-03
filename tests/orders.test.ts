import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { todayJakarta, validBusinessDate } from "@/lib/date";
import { orderTotal, formatRupiah } from "@/lib/money";
import {
  orderSchema,
  parseOrderFilters,
  orderQuery,
  type OrderRow,
} from "@/features/orders/schema";
import { orderWhere } from "@/features/orders/query";
import { ordersCsv, ordersXlsx } from "@/features/orders/export";

const valid = {
  orderDate: "2026-11-03",
  customerName: "Pelanggan",
  categoryId: "root",
  subcategoryId: null,
  quantity: "250",
  unit: "pcs",
  unitPrice: "2000",
  status: "NEW",
  notes: "",
};
describe("ORD-01/02/07 nilai pesanan dan tanggal", () => {
  it("250 × 2.000 dan edit 300, decimal HALF_UP serta Rupiah besar tetap tepat", () => {
    expect(orderTotal("250", "2000")).toBe("500000");
    expect(orderTotal("300", "2000")).toBe("600000");
    expect(orderTotal("1,005", "100")).toBe("101");
    expect(orderTotal("0.001", "500")).toBe("1");
    expect(orderTotal("1", "999999999999999999")).toBe("999999999999999999");
    expect(formatRupiah("999999999999999999")).toContain(
      "999.999.999.999.999.999",
    );
  });
  it.each(["0", "-1", "1.0001", "NaN", "Infinity", "1e3", "", "1.2.3"])(
    "menolak quantity %s",
    (quantity) => {
      expect(orderSchema.safeParse({ ...valid, quantity }).success).toBe(false);
    },
  );
  it.each(["-1", "1.5", "Infinity", "1e5", ""])(
    "menolak harga %s",
    (unitPrice) => {
      expect(orderSchema.safeParse({ ...valid, unitPrice }).success).toBe(
        false,
      );
    },
  );
  it("menolak total spoof, tipe angka JSON, overflow, status asing; menerima harga nol", () => {
    expect(orderSchema.safeParse({ ...valid, totalPrice: "1" }).success).toBe(
      false,
    );
    expect(orderSchema.safeParse({ ...valid, quantity: 250 }).success).toBe(
      false,
    );
    expect(
      orderSchema.safeParse({
        ...valid,
        quantity: "2",
        unitPrice: "999999999999999999",
      }).success,
    ).toBe(false);
    expect(orderSchema.safeParse({ ...valid, status: "LUNAS" }).success).toBe(
      false,
    );
    expect(orderSchema.parse({ ...valid, unitPrice: "0" }).unitPrice).toBe("0");
  });
  it("default hari WIB benar di batas UTC; tanggal mustahil dan tahun kabisat diperiksa", () => {
    expect(todayJakarta(new Date("2026-11-02T17:00:00Z"))).toBe("2026-11-03");
    expect(todayJakarta(new Date("2026-11-02T16:59:59Z"))).toBe("2026-11-02");
    expect(validBusinessDate("2026-02-29")).toBe(false);
    expect(validBusinessDate("2024-02-29")).toBe(true);
    expect(
      orderSchema.parse({ ...valid, orderDate: undefined }).orderDate,
    ).toBe(todayJakarta());
  });
});
describe("ORD-05/07 satu kontrak filter", () => {
  it("query menggabungkan filter dan mencari snapshot maupun nama master saat ini", () => {
    const filters = parseOrderFilters(
      new URLSearchParams(
        "q=Indoor&status=IN_PROGRESS&categoryId=root&subcategoryId=child&start=2026-11-01&end=2026-11-30&page=2&pageSize=25",
      ),
    );
    const where = orderWhere(filters);
    expect(where).toMatchObject({
      deletedAt: null,
      status: "IN_PROGRESS",
      categoryId: "root",
      subcategoryId: "child",
      orderDate: { gte: new Date("2026-11-01"), lte: new Date("2026-11-30") },
    });
    expect(where.OR).toHaveLength(6);
    expect(where.OR).toContainEqual({
      category: { name: { contains: "Indoor", mode: "insensitive" } },
    });
    expect(parseOrderFilters(new URLSearchParams(orderQuery(filters)))).toEqual(
      filters,
    );
  });
  it.each([
    "start=2026-11-20&end=2026-11-01",
    "start=2026-02-30",
    "status=INVALID",
    "page=0",
    "page=NaN",
    "pageSize=999",
    "subcategoryId=orphan",
    "q=a&q=b",
  ])("menolak filter invalid %s", (query) => {
    expect(() => parseOrderFilters(new URLSearchParams(query))).toThrow();
  });
});

const example: OrderRow = {
  id: "test",
  orderNumber: "IM-TEST",
  orderDate: "2026-11-03",
  customerName: '=HYPERLINK("evil")',
  categoryId: "root",
  subcategoryId: "child",
  categoryNameSnapshot: "+Kategori",
  productNameSnapshot: "@Produk",
  quantity: "250.000",
  unit: "pcs",
  unitPrice: "2000",
  totalPrice: "500000",
  status: "NEW",
  notes: 'Cetak "Bagus", warna hijau\nBaris kedua é Indonesia',
  updatedAt: new Date(0).toISOString(),
  incomeCount: 0,
  budgetCount: 0,
};
describe("ORD-06 ekspor dibaca kembali", () => {
  it("CSV UTF-8 BOM, RFC4180, karakter Indonesia, quote/newline dan formula injection", () => {
    const csv = ordersCsv([
      example,
      { ...example, customerName: " \t=1+1", notes: "\tcatatan" },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const rows = parse(csv, { bom: true, columns: true }) as Record<
      string,
      string
    >[];
    expect(rows).toHaveLength(2);
    expect(rows[0]["Nama Pelanggan"]).toBe(`'${example.customerName}`);
    expect(rows[0].Kategori).toBe("'+Kategori");
    expect(rows[0]["Produk / Subkategori"]).toBe("'@Produk");
    expect(rows[0].Catatan).toBe(example.notes);
    expect(rows[1]["Nama Pelanggan"]).toBe("' \t=1+1");
    expect(rows[1].Catatan).toBe("'\tcatatan");
    expect(rows[0]["Total Harga (Rp)"]).toBe("500000");
  });
  it("XLSX asli: worksheet, string bukan formula, angka numerik dan 18-digit presisi", async () => {
    const bytes = await ordersXlsx(
      [example, { ...example, totalPrice: "999999999999999999" }],
      parseOrderFilters({}),
    );
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Uint8Array.from(bytes).buffer);
    const sheet = book.getWorksheet("Permintaan")!;
    expect(sheet.rowCount).toBe(3);
    expect(book.getWorksheet("Keterangan")).toBeTruthy();
    expect(sheet.getCell("C2").value).toBe(example.customerName);
    expect(sheet.getCell("C2").type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell("I2").value).toBe(500000);
    expect(sheet.getCell("I3").value).toBe("999999999999999999");
    expect(sheet.getCell("K2").value).toBe(example.notes);
  });
  it("hasil kosong tetap menghasilkan header CSV dan workbook valid", async () => {
    expect(parse(ordersCsv([]), { bom: true })).toHaveLength(1);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      Uint8Array.from(await ordersXlsx([], parseOrderFilters({}))).buffer,
    );
    expect(book.getWorksheet("Permintaan")?.rowCount).toBe(1);
  });
});
