import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { reportFixture } from "./fixtures/report";
import { buildStatement, preparationSchema, type StatementKind } from "@/features/reports/statements";
import { statementCsv, statementXlsx } from "@/features/reports/statement-export";

const value = (report: ReturnType<typeof buildStatement>, label: string) => report.rows.find(row => row.label === label)?.amount;
describe("Laporan terpisah: perhitungan dan kelengkapan", () => {
  it("modal kosong tetap belum tersedia, bukan nol atau angka penyeimbang", () => {
    const r = buildStatement(reportFixture(), "neraca");
    expect(value(r, "Modal pemilik")).toBeNull();
    expect(value(r, "Saldo laba/rugi")).toBeNull();
    expect(value(r, "TOTAL HUTANG DAN EKUITAS")).toBeNull();
    expect(r.status).toBe("draft");
    expect(r.period).toBe("Per 30 Nov 2026");
  });
  it("neraca memakai saldo kas akhir dan ekuitas yang diisi, tanpa mutasi sumber", () => {
    const data = reportFixture(), before = structuredClone(data);
    const r = buildStatement(data, "neraca", preparationSchema.parse({ capital: "2000000", retainedEarnings: "600000", balanceConfirmed: true }));
    expect(value(r, "TOTAL ASET")).toBe("2600000");
    expect(value(r, "TOTAL HUTANG DAN EKUITAS")).toBe("2600000");
    expect(r.status).toBe("ready");
    expect(data).toEqual(before);
  });
  it("selisih neraca ditampilkan tanpa mengubah modal atau saldo laba", () => {
    const r = buildStatement(reportFixture(), "neraca", preparationSchema.parse({ capital: "0", retainedEarnings: "0", balanceConfirmed: true }));
    expect(value(r, "Modal pemilik")).toBe("0");
    expect(value(r, "Selisih yang perlu diperiksa")).toBe("2600000");
    expect(r.status).toBe("draft");
  });
  it("piutang, hutang, nilai buku aset, persediaan, uang muka dan ekuitas negatif dihitung tepat", () => {
    const data = reportFixture();
    data.finance.closingBalance = "0";
    data.assets.rows = [{ id: "asset-id", name: "Mesin", amount: "100", accumulated: "200", bookValue: "800" }];
    data.trade.receivableRemaining = "400"; data.trade.payableRemaining = "1800";
    const r = buildStatement(data, "neraca", preparationSchema.parse({ inventory: "100", supplierAdvances: "50", otherAssets: "50", loans: "100", customerAdvances: "50", otherLiabilities: "50", capital: "0", retainedEarnings: "-600", balanceConfirmed: true }));
    expect(value(r, "Harga perolehan aset tetap")).toBe("1000");
    expect(value(r, "Akumulasi penyusutan")).toBe("-200");
    expect(value(r, "TOTAL ASET")).toBe("1400");
    expect(value(r, "TOTAL HUTANG DAN EKUITAS")).toBe("1400");
    expect(r.status).toBe("ready");
  });
  it("saldo kas belum dikonfigurasi menghasilkan total belum tersedia", () => {
    const data = reportFixture(); data.finance.openingBalance = null; data.finance.closingBalance = null;
    expect(value(buildStatement(data, "neraca"), "TOTAL ASET")).toBeNull();
    const flow = buildStatement(data, "arus-kas", preparationSchema.parse({ classificationConfirmed: true }));
    expect(flow.status).toBe("draft");
    expect(value(flow, "KENAIKAN / PENURUNAN KAS")).toBe("600000");
  });
  it("klasifikasi aset/modal/pinjaman rekonsiliasi ke kas, penyusutan hanya memengaruhi laba", () => {
    const data = reportFixture(); data.assets.purchases = "200000"; data.assets.depreciation = "50000";
    const inputs = preparationSchema.parse({ contributions: "50000", loanReceipts: "30000", drawings: "20000", loanRepayments: "10000", additionalAssetPurchases: "100000", classificationConfirmed: true });
    const profit = buildStatement(data, "laba-rugi", inputs), flow = buildStatement(data, "arus-kas", inputs);
    expect(value(profit, "Total pendapatan")).toBe("1220000");
    expect(value(profit, "Total biaya")).toBe("420000");
    expect(value(profit, "LABA / RUGI PERIODE BERJALAN")).toBe("800000");
    expect(value(flow, "Kas bersih operasional")).toBe("850000");
    expect(value(flow, "Kas bersih investasi")).toBe("-300000");
    expect(value(flow, "Kas bersih pendanaan")).toBe("50000");
    expect(value(flow, "KENAIKAN / PENURUNAN KAS")).toBe("600000");
    expect(value(flow, "SALDO KAS AKHIR")).toBe("2600000");
    expect(profit.status).toBe("ready"); expect(flow.status).toBe("ready");
  });
  it("klasifikasi berlebih tidak menghasilkan laba/operasional yang tampak valid", () => {
    const inputs = preparationSchema.parse({ contributions: "100001", drawings: "700001", classificationConfirmed: true });
    const profit = buildStatement(reportFixture(), "laba-rugi", inputs), flow = buildStatement(reportFixture(), "arus-kas", inputs);
    expect(value(profit, "LABA / RUGI PERIODE BERJALAN")).toBeNull();
    expect(value(flow, "Kas bersih operasional")).toBeNull();
    expect(profit.status).toBe("draft"); expect(flow.status).toBe("draft");
  });
  it("penjualan aset tidak dianggap laba pelepasan yang sudah lengkap", () => {
    const r = buildStatement(reportFixture(), "laba-rugi", preparationSchema.parse({ assetSales: "100000", classificationConfirmed: true }));
    expect(r.status).toBe("draft");
    expect(r.issues.join(" ")).toContain("Nilai buku");
  });
  it("pelengkap tersimpan dipakai sebagai default dan dibedakan dari isian sementara", () => {
    const data = reportFixture();
    data.preparation = { available: true, version: 2, savedAt: "2026-11-19T00:00:00Z", values: preparationSchema.parse({ classificationConfirmed: true }) };
    expect(buildStatement(data, "laba-rugi").notes).toContain("Pelengkap tersimpan versi 2.");
    expect(buildStatement(data, "laba-rugi", preparationSchema.parse({})).notes.join(" ")).toContain("Pelengkap sementara");
  });
  it.each([{ inventory: "-1" }, { capital: "1.2" }, { loans: "1,000" }, { capital: "1234567890123456789" }, { extra: "1" }])("menolak nominal atau field invalid %o", input => {
    expect(() => preparationSchema.parse(input)).toThrow();
  });
});

describe("Ekspor keuangan: satu laporan, dua kolom, portrait", () => {
  it.each(["neraca", "laba-rugi", "arus-kas"] as StatementKind[])("%s: isi CSV/XLSX sama dengan pratinjau, hanya satu sheet", async kind => {
    const report = buildStatement(reportFixture(), kind);
    const csv = statementCsv(report);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const records = parse(csv, { bom: true, columns: true }) as Record<string, string>[];
    expect(Object.keys(records[0])).toEqual(["Uraian", "Jumlah (Rp)"]);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Uint8Array.from(await statementXlsx(report)).buffer);
    expect(book.worksheets.map(s => s.name)).toEqual([report.title]);
    const sheet = book.worksheets[0];
    expect(sheet.columnCount).toBe(2);
    expect(sheet.pageSetup).toMatchObject({ paperSize: 9, orientation: "portrait", fitToWidth: 1, fitToHeight: 0, fitToPage: true });
    expect(sheet.pageSetup.printArea).toBe(`A1:B${sheet.rowCount}`);
    expect(sheet.getCell("A4").value).toContain("DRAF");
    report.rows.forEach((row, index) => {
      const expected = records.find(record => record.Uraian === row.label)!;
      expect(expected["Jumlah (Rp)"]).toBe(row.amount ?? (row.style === "section" ? "" : "Belum tersedia"));
      expect(sheet.getCell(index + 7, 1).value).toBe(row.label);
      if (row.amount !== null) expect(String(sheet.getCell(index + 7, 2).value)).toBe(row.amount);
      expect(sheet.getCell(index + 7, 1).font.size).toBe(11);
    });
  });
  it("nominal 18 digit dipertahankan sebagai teks di Excel dan angka utuh di CSV", async () => {
    const data = reportFixture(); data.finance.closingBalance = "999999999999999999";
    const report = buildStatement(data, "neraca"), book = new ExcelJS.Workbook();
    await book.xlsx.load(Uint8Array.from(await statementXlsx(report)).buffer);
    expect(book.worksheets[0].getCell("B8").value).toBe("999999999999999999");
    expect(statementCsv(report)).toContain("999999999999999999");
  });
  it("catatan formula tetap teks dan kutip/newline CSV tetap terbaca", async () => {
    const report = buildStatement(reportFixture(), "laba-rugi");
    report.notes = ['=SUM(1,2)', 'Catatan "pemilik"\nbaris kedua'];
    const rows = parse(statementCsv(report), { bom: true, columns: true }) as Record<string, string>[];
    expect(rows.at(-2)!.Uraian).toBe("'=SUM(1,2)");
    expect(rows.at(-1)!.Uraian).toBe('Catatan "pemilik"\nbaris kedua');
    const book = new ExcelJS.Workbook(); await book.xlsx.load(Uint8Array.from(await statementXlsx(report)).buffer);
    expect(book.worksheets[0].getCell(`A${book.worksheets[0].rowCount - 1}`).type).toBe(ExcelJS.ValueType.String);
  });
});
