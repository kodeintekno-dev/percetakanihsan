import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { reportFixture } from "./fixtures/report";
import { automaticReportLabel, buildStatement, type StatementKind } from "@/features/reports/statements";
import { statementCsv, statementXlsx } from "@/features/reports/statement-export";

const value = (report: ReturnType<typeof buildStatement>, label: string) => report.rows.find(row => row.label === label)?.amount;
const equityLabel = "Ekuitas (total aset dikurangi total hutang)";

describe("Laporan otomatis dari data tercatat", () => {
  it("kas pembukaan lima juta menghasilkan aset dan ekuitas lima juta tanpa isian modal", () => {
    const data = reportFixture();
    data.finance = { ...data.finance, openingBalance: "5000000", closingBalance: "5000000", income: "0", expense: "0", net: "0", count: 0, groups: { PRODUCTION: "0", OPERATIONAL: "0", MARKETING: "0" } };
    data.opening = { date: "2026-11-01", amount: "5000000" };
    const before = structuredClone(data), report = buildStatement(data, "neraca");
    expect(value(report, "Kas")).toBe("5000000");
    expect(value(report, "TOTAL ASET")).toBe("5000000");
    expect(value(report, equityLabel)).toBe("5000000");
    expect(value(report, "TOTAL HUTANG DAN EKUITAS")).toBe("5000000");
    expect(report.rows.some(row => ["Modal pemilik", "Saldo laba/rugi"].includes(row.label))).toBe(false);
    expect(report.notes.join(" ")).toContain("5.000.000");
    expect(report.status).toBe("ready");
    expect(data).toEqual(before);
  });
  it("saldo pembukaan hanya dihitung sekali pada kas akhir", () => {
    const data = reportFixture();
    data.opening = { date: "2026-11-01", amount: "5000000" };
    data.finance.openingBalance = "5000000"; data.finance.closingBalance = "5600000";
    const report = buildStatement(data, "neraca");
    expect(value(report, equityLabel)).toBe("5600000");
    expect(value(buildStatement(data, "laba-rugi"), "LABA / RUGI PERIODE BERJALAN")).toBe("600000");
  });
  it("piutang, nilai buku aset dan hutang menghasilkan A = L + E tanpa nominal buatan", () => {
    const data = reportFixture();
    data.finance.closingBalance = "5600000";
    data.trade.receivableRemaining = "1000000"; data.trade.payableRemaining = "300000";
    data.assets.rows = [{ id: "asset-id", name: "Mesin", amount: "100000", accumulated: "500000", bookValue: "1500000" }];
    const report = buildStatement(data, "neraca");
    expect(value(report, "Harga perolehan aset tetap")).toBe("2000000");
    expect(value(report, "Akumulasi penyusutan")).toBe("-500000");
    expect(value(report, "TOTAL ASET")).toBe("8100000");
    expect(value(report, "Total hutang")).toBe("300000");
    expect(value(report, equityLabel)).toBe("7800000");
    expect(value(report, "TOTAL HUTANG DAN EKUITAS")).toBe("8100000");
    expect(report.status).toBe("ready");
    expect(report.rows.map(row => row.label)).not.toContain("Pinjaman");
    expect(report.rows.map(row => row.label)).not.toContain("Persediaan bahan");
  });
  it("ekuitas negatif diperbolehkan bila hutang melampaui aset", () => {
    const data = reportFixture(); data.finance.closingBalance = "100"; data.trade.payableRemaining = "200";
    const report = buildStatement(data, "neraca");
    expect(value(report, equityLabel)).toBe("-100");
    expect(value(report, "TOTAL HUTANG DAN EKUITAS")).toBe("100");
    expect(report.status).toBe("ready");
  });
  it("saldo pembukaan nol adalah nilai sah", () => {
    const data = reportFixture(); data.finance.closingBalance = "0"; data.finance.openingBalance = "0"; data.opening!.amount = "0";
    const report = buildStatement(data, "neraca");
    expect(value(report, equityLabel)).toBe("0"); expect(report.status).toBe("ready");
  });
  it("neraca memakai kas per tanggal akhir ketika awal periode mendahului pembukaan", () => {
    const data = reportFixture();
    data.finance.closingBalance = null; data.finance.openingBalance = null;
    data.finance.balanceStatus = "BEFORE_OPENING";
    data.opening = { date: "2026-11-15", amount: "5000000" };
    data.balanceCash = "5000000";
    const report = buildStatement(data, "neraca");
    expect(value(report, "Kas")).toBe("5000000");
    expect(value(report, equityLabel)).toBe("5000000");
    expect(report.status).toBe("ready");
    data.balanceCash = null;
    expect(buildStatement(data, "neraca").status).toBe("draft");
  });
  it("saldo kas yang benar-benar belum dapat dihitung tetap tidak dianggap nol", () => {
    const data = reportFixture(); data.finance.openingBalance = null; data.finance.closingBalance = null; data.opening = null;
    const report = buildStatement(data, "neraca");
    expect(value(report, "TOTAL ASET")).toBeNull(); expect(value(report, equityLabel)).toBeNull();
    expect(report.status).toBe("draft");
    const flow = buildStatement(data, "arus-kas");
    expect(flow.status).toBe("draft"); expect(value(flow, "KENAIKAN / PENURUNAN KAS")).toBe("600000");
  });
  it("pembelian aset dipisah otomatis, penyusutan memengaruhi laba tanpa mengurangi kas", () => {
    const data = reportFixture(); data.assets.purchases = "200000"; data.assets.depreciation = "50000";
    const before = structuredClone(data), profit = buildStatement(data, "laba-rugi"), flow = buildStatement(data, "arus-kas");
    expect(value(profit, "Total pendapatan")).toBe("1300000");
    expect(value(profit, "Total biaya")).toBe("550000");
    expect(value(profit, "LABA / RUGI PERIODE BERJALAN")).toBe("750000");
    expect(value(flow, "Kas bersih selain investasi tertaut")).toBe("800000");
    expect(value(flow, "Kas bersih investasi tertaut")).toBe("-200000");
    expect(value(flow, "KENAIKAN / PENURUNAN KAS")).toBe("600000");
    expect(value(flow, "SALDO KAS AKHIR")).toBe("2600000");
    expect(profit.status).toBe("ready"); expect(flow.status).toBe("ready");
    expect(data).toEqual(before);
  });
  it("pemasukan lain-lain tidak ditebak sebagai modal/pinjaman/penjualan aset", () => {
    const report = buildStatement(reportFixture(), "arus-kas");
    expect(value(report, "Pemasukan lain-lain sesuai Buku Kas")).toBe("100000");
    expect(report.rows.some(row => ["Setoran modal", "Penerimaan pinjaman", "Hasil penjualan aset"].includes(row.label))).toBe(false);
    expect(report.notes.join(" ")).toContain("belum memiliki klasifikasi terpisah");
  });
  it("nilai pembelian aset yang tidak cocok tidak menghasilkan biaya negatif yang tampak sah", () => {
    const data = reportFixture(); data.assets.purchases = "700001";
    const profit = buildStatement(data, "laba-rugi"), flow = buildStatement(data, "arus-kas");
    expect(value(profit, "LABA / RUGI PERIODE BERJALAN")).toBeNull();
    expect(value(flow, "Kas bersih selain investasi tertaut")).toBeNull();
    expect(profit.status).toBe("draft"); expect(flow.status).toBe("draft");
  });
});

describe("Ekspor keuangan otomatis: satu laporan, dua kolom, portrait", () => {
  it.each(["neraca", "laba-rugi", "arus-kas"] as StatementKind[])("%s: isi CSV/XLSX sama dengan pratinjau, hanya satu sheet", async kind => {
    const report = buildStatement(reportFixture(), kind);
    expect(report.status).toBe("ready");
    const csv = statementCsv(report);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const records = parse(csv, { bom: true, columns: true }) as Record<string, string>[];
    expect(Object.keys(records[0])).toEqual(["Uraian", "Jumlah (Rp)"]);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(Uint8Array.from(await statementXlsx(report)).buffer);
    expect(book.worksheets.map(sheet => sheet.name)).toEqual([report.title]);
    const sheet = book.worksheets[0];
    expect(sheet.columnCount).toBe(2);
    expect(sheet.pageSetup).toMatchObject({ paperSize: 9, orientation: "portrait", fitToWidth: 1, fitToHeight: 0, fitToPage: true });
    expect(sheet.pageSetup.printArea).toBe(`A1:B${sheet.rowCount}`);
    expect(sheet.getCell("A4").value).toBe(automaticReportLabel);
    report.rows.forEach((row, index) => {
      expect(records.find(record => record.Uraian === row.label)!["Jumlah (Rp)"]).toBe(row.amount ?? (row.style === "section" ? "" : "Belum tersedia"));
      expect(sheet.getCell(index + 7, 1).value).toBe(row.label);
      if (row.amount !== null) expect(String(sheet.getCell(index + 7, 2).value)).toBe(row.amount);
    });
    expect(csv).not.toContain("Belum tersedia");
  });
  it("nominal 18 digit dipertahankan, termasuk ekuitas", async () => {
    const data = reportFixture(); data.finance.closingBalance = "999999999999999999";
    const report = buildStatement(data, "neraca"), book = new ExcelJS.Workbook();
    await book.xlsx.load(Uint8Array.from(await statementXlsx(report)).buffer);
    expect(book.worksheets[0].getCell("B8").value).toBe("999999999999999999");
    expect(value(report, equityLabel)).toBe("999999999999999999");
  });
  it("catatan formula tetap teks dan kutip/newline CSV tetap terbaca", async () => {
    const report = buildStatement(reportFixture(), "laba-rugi"); report.notes = ['=SUM(1,2)', 'Catatan "pemilik"\nbaris kedua'];
    const rows = parse(statementCsv(report), { bom: true, columns: true }) as Record<string, string>[];
    expect(rows.at(-2)!.Uraian).toBe("'=SUM(1,2)"); expect(rows.at(-1)!.Uraian).toBe('Catatan "pemilik"\nbaris kedua');
    const book = new ExcelJS.Workbook(); await book.xlsx.load(Uint8Array.from(await statementXlsx(report)).buffer);
    expect(book.worksheets[0].getCell(`A${book.worksheets[0].rowCount - 1}`).type).toBe(ExcelJS.ValueType.String);
  });
});
