import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { reportFixture } from "./fixtures/report";
import {
  parseReportFilters,
  reportPeriod,
  reportQuery,
} from "@/features/reports/schema";
import {
  reportsCsv,
  reportsXlsx,
  reportCsvHeaders,
} from "@/features/reports/export";
import { monthRange, validBusinessDate } from "@/lib/date";
import { spreadsheetNumber, tabularCsv } from "@/lib/spreadsheet-export";
describe("RPT periode WIB dan presisi ekspor", () => {
  it("default berdasarkan pergantian bulan WIB dan parser tidak memodifikasi input", () => {
    const input = {};
    expect(parseReportFilters(input, new Date("2026-10-31T17:00:00Z"))).toEqual(
      { mode: "month", month: 11, year: 2026 },
    );
    expect(input).toEqual({});
    expect(
      reportPeriod(parseReportFilters({ year: 2024, month: 2 })),
    ).toMatchObject({ start: "2024-02-01", end: "2024-02-29" });
  });
  it("range inklusif, kalender tahun kecil/besar dan roundtrip query", () => {
    const filters = parseReportFilters({
      start: "2026-11-01",
      end: "2026-11-30",
    });
    expect(reportPeriod(filters).start).toBe("2026-11-01");
    expect(
      parseReportFilters(new URLSearchParams(reportQuery(filters))),
    ).toEqual(filters);
    expect(monthRange(99, 2)).toEqual({
      start: "0099-02-01",
      end: "0099-02-28",
    });
    expect(monthRange(9999, 12).end).toBe("9999-12-31");
    expect(validBusinessDate("0000-01-01")).toBe(false);
  });
  it.each([
    { mode: "month", month: 13, year: 2026 },
    { mode: "month", month: 1, year: 0 },
    { mode: "range", start: "2026-11-30", end: "2026-11-01" },
    { mode: "range", start: "2026-02-30", end: "2026-03-01" },
    { mode: "month", year: 2026, month: 11, start: "2026-11-01" },
    { q: "filter-tidak-didukung" },
  ])("menolak periode/parameter invalid %o", (input) => {
    expect(() => parseReportFilters(input)).toThrow();
  });
  it("parameter duplikat ditolak dan integer tidak aman tetap string meski digit signifikan sedikit", () => {
    expect(() =>
      parseReportFilters(new URLSearchParams("year=2026&year=2025")),
    ).toThrow();
    expect(spreadsheetNumber("123456789012345000")).toBe("123456789012345000");
    expect(spreadsheetNumber("1200000")).toBe(1200000);
    expect(spreadsheetNumber("0.125")).toBe(0.125);
    expect(() => tabularCsv(["angka"], [[{ number: "=1+1" }]])).toThrow();
  });
});
describe("RPT-08: isi dan struktur berkas laporan lengkap", () => {
  it("CSV13 kolom, seluruh bagian dan angka rekonsiliasi, BOM/CRLF", () => {
    const csv = reportsCsv(reportFixture());
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("\r\n");
    const rows = parse(csv, { bom: true, columns: true }) as Record<
      string,
      string
    >[];
    expect(Object.keys(rows[0])).toEqual(reportCsvHeaders);
    expect(new Set(rows.map((r) => r.bagian))).toEqual(
      new Set([
        "metadata",
        "ringkasan",
        "pendapatan",
        "pengeluaran",
        "laba_rugi",
        "arus_kas",
        "analitik_pos",
      ]),
    );
    expect(
      rows.find((r) => r.bagian === "ringkasan" && r.subbagian === "kas_masuk")!
        .nominal,
    ).toBe("1300000");
    expect(
      rows.find((r) => r.bagian === "arus_kas" && r.subbagian === "periode"),
    ).toMatchObject({
      saldo_awal: "2000000",
      saldo_akhir: "2600000",
      periode_mulai: "2026-11-01",
      periode_selesai: "2026-11-30",
    });
    expect(
      rows.find((r) => r.bagian === "analitik_pos" && r.nama === "Kertas")!
        .persentase,
    ).toBe("57.14");
  });
  it("XLSX lima sheet bernama tepat, judul/periode, tipe numerik dan nilai identik", async () => {
    const b = new ExcelJS.Workbook();
    await b.xlsx.load(
      Uint8Array.from(await reportsXlsx(reportFixture())).buffer,
    );
    expect(b.worksheets.map((s) => s.name)).toEqual([
      "Ringkasan",
      "Pendapatan",
      "Pengeluaran",
      "Arus Kas",
      "Analitik Pos",
      "Penyusutan",
    ]);
    expect(b.getWorksheet("Ringkasan")!.getCell("A1").value).toBe(
      "CV Ihsan Mandiri",
    );
    expect(b.getWorksheet("Ringkasan")!.getCell("C7").value).toBe(1300000);
    expect(b.getWorksheet("Ringkasan")!.getCell("C9").value).toBe(600000);
    expect(b.getWorksheet("Arus Kas")!.getCell("G8").value).toBe(2600000);
    expect(b.getWorksheet("Pendapatan")!.getCell("F8").value).toBe(100);
    expect(b.getWorksheet("Analitik Pos")!.getCell("E7").value).toBe(57.14);
    expect(b.getWorksheet("Pengeluaran")!.getCell("D7").value).toBe(400000);
  });
  it("satuan campur/unknown tidak mengulang uang, nol eksplisit bukan kosong", () => {
    const d = reportFixture();
    d.income.sales[0].quantities.push({ unit: "meter", quantity: "0.000" });
    d.income.sales[0].unknownQuantityCount = 1;
    const rows = parse(reportsCsv(d), { bom: true, columns: true }) as Record<
      string,
      string
    >[];
    const income = rows.filter((r) => r.bagian === "pendapatan");
    expect(income.filter((r) => r.subbagian === "penjualan")).toHaveLength(1);
    expect(
      income.filter((r) => r.subbagian === "kuantitas_tercatat"),
    ).toHaveLength(2);
    expect(income.find((r) => r.satuan === "meter")!.kuantitas).toBe("0.000");
    expect(
      income.find((r) => r.subbagian === "kuantitas_belum_dicatat")!.kuantitas,
    ).toBe("");
    expect(
      income
        .filter((r) => r.subbagian === "kuantitas_tercatat")
        .every((r) => r.nominal === ""),
    ).toBe(true);
  });
  it.each([
    "=SUM(1,2)",
    "+CMD",
    "-CMD",
    "@SUM(A1)",
    "\t=1",
    "\r=1",
    "\uFEFF=1",
  ])("teks %s aman di CSV dan tetap sel teks XLSX", async (text) => {
    const d = reportFixture();
    d.income.sales[0].categoryName = text;
    d.income.sales[0].productName = text;
    d.posts[0].postName = text;
    const rows = parse(reportsCsv(d), { bom: true, columns: true }) as Record<
      string,
      string
    >[];
    expect(
      rows.find(
        (r) => r.bagian === "pendapatan" && r.subbagian === "penjualan",
      )!.nama,
    ).toBe(`'${text}`);
    const b = new ExcelJS.Workbook();
    await b.xlsx.load(Uint8Array.from(await reportsXlsx(d)).buffer);
    expect(b.getWorksheet("Pendapatan")!.getCell("A7").type).toBe(
      ExcelJS.ValueType.String,
    );
    expect(b.getWorksheet("Pendapatan")!.getCell("A7").value).toBe(
      text.replace(/\r\n?/g, "\n"),
    );
  });
  it("saldo tidak tersedia tetap kosong, ekspor nol valid, agregat besar tetap presisi", async () => {
    const d = reportFixture();
    d.finance = {
      ...d.finance,
      income: "0",
      expense: "0",
      net: "0",
      count: 0,
      groups: { PRODUCTION: "0", OPERATIONAL: "0", MARKETING: "0" },
      openingBalance: null,
      closingBalance: null,
      openingDate: null,
      balanceStatus: "NOT_CONFIGURED",
    };
    d.opening = null;
    d.income = {
      ...d.income,
      sales: [],
      saleAmount: "0",
      saleTransactionCount: 0,
      linkedOrderCount: 0,
      otherAmount: "0",
      otherTransactionCount: 0,
    };
    d.expenses = [];
    d.posts = [];
    d.daily = [];
    const rows = parse(reportsCsv(d), { bom: true, columns: true }) as Record<
      string,
      string
    >[];
    expect(
      rows.find((r) => r.bagian === "arus_kas" && r.subbagian === "periode"),
    ).toMatchObject({ saldo_awal: "", saldo_akhir: "" });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Uint8Array.from(await reportsXlsx(d)).buffer);
    expect(book.worksheets).toHaveLength(6);
    expect(book.getWorksheet("Arus Kas")!.getCell("F8").value).toBeNull();
    d.finance.income = "1000000000000000000";
    await book.xlsx.load(Uint8Array.from(await reportsXlsx(d)).buffer);
    expect(book.getWorksheet("Ringkasan")!.getCell("C7").value).toBe(
      "1000000000000000000",
    );
  });
});
