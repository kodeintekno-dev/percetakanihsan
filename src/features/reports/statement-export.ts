import "server-only";
import ExcelJS from "exceljs";
import { spreadsheetNumber, tabularCsv, type ExportCell } from "@/lib/spreadsheet-export";
import { automaticReportLabel, type FinancialStatement } from "./statements";

export function statementCsv(report: FinancialStatement) {
  const rows: ExportCell[][] = [
    ["CV Ihsan Mandiri", null], [report.title, null], [report.period, null],
    [report.status === "draft" ? "DRAF — perlu pemeriksaan" : automaticReportLabel, null],
    ...report.rows.map(row => [row.label, row.amount === null ? row.style === "section" ? null : "Belum tersedia" : { number: row.amount }] as ExportCell[]),
    ...report.issues.map(note => [`Perlu diperiksa: ${note}`, null] as ExportCell[]),
    ...report.notes.map(note => [note, null] as ExportCell[]),
  ];
  return tabularCsv(["Uraian", "Jumlah (Rp)"], rows);
}

export async function statementXlsx(report: FinancialStatement) {
  const book = new ExcelJS.Workbook();
  book.creator = "CV Ihsan Mandiri";
  book.subject = report.title;
  const sheet = book.addWorksheet(report.title, {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      horizontalCentered: true, printTitlesRow: "1:6",
      margins: { left: 0.35, right: 0.35, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 },
    },
    headerFooter: { oddFooter: `${report.title} | Halaman &P dari &N` },
  });
  sheet.columns = [{ width: 57 }, { width: 26 }];
  for (const [i, text] of ["CV Ihsan Mandiri", report.title, report.period, report.status === "draft" ? "DRAF — perlu pemeriksaan" : automaticReportLabel].entries()) {
    sheet.mergeCells(i + 1, 1, i + 1, 2);
    const cell = sheet.getCell(i + 1, 1);
    cell.value = text;
    cell.font = { name: "Arial", size: i < 2 ? 14 : 11, bold: i < 2 || i === 3 };
    cell.alignment = { vertical: "middle", wrapText: true };
    sheet.getRow(i + 1).height = i < 2 ? 24 : 20;
  }
  sheet.getRow(6).values = ["Uraian", "Jumlah (Rp)"];
  sheet.getRow(6).height = 24;
  for (const column of [1, 2]) {
    const cell = sheet.getCell(6, column);
    cell.font = { name: "Arial", size: 11, bold: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FF69766B" } } };
  }
  for (const item of report.rows) {
    const row = sheet.addRow([item.label, item.amount === null ? item.style === "section" ? null : "Belum tersedia" : spreadsheetNumber(item.amount)]);
    for (const column of [1, 2]) {
      const cell = row.getCell(column);
      cell.font = { name: "Arial", size: 11, bold: item.style !== "item" };
      cell.alignment = { vertical: "middle", wrapText: true };
      if (item.style === "section") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F3ED" } };
      if (item.style === "total" || item.style === "subtotal") cell.border = { top: { style: item.style === "total" ? "double" : "thin", color: { argb: "FF788477" } } };
    }
    row.height = item.label.length > 52 ? 32 : 21;
    row.getCell(2).alignment = { horizontal: "right", vertical: "middle" };
    row.getCell(2).numFmt = typeof row.getCell(2).value === "number" ? '#,##0;(#,##0);"—"' : "@";
    if (item.style === "section") {
      row.height = 25;
    }
  }
  sheet.addRow([]).height = 8;
  for (const text of [...report.issues.map(note => `Perlu diperiksa: ${note}`), ...report.notes]) {
    const row = sheet.addRow([text]);
    sheet.mergeCells(row.number, 1, row.number, 2);
    row.getCell(1).font = { name: "Arial", size: 10 };
    row.getCell(1).alignment = { wrapText: true, vertical: "middle" };
    row.height = text.split(/\r\n|\r|\n/).reduce((lines, text) => lines + Math.max(1, Math.ceil(text.length / 88)), 0) * 14 + 7;
  }
  sheet.pageSetup.printArea = `A1:B${sheet.rowCount}`;
  return new Uint8Array(await book.xlsx.writeBuffer());
}
