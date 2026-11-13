import "server-only";
import ExcelJS from "exceljs";
import { ExactDecimal } from "./money";
export function safeCsvText(value: string) {
  const safe = /^[\t\r\n]|^[\s\p{Cc}\p{Cf}]*[=+\-@]/u.test(value)
    ? `'${value}`
    : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export type ExportCell = string | { number: string } | null;
export function numericText(value: string) {
  if (!/^-?\d+(?:\.\d+)?$/.test(value))
    throw new Error("Nilai ekspor numerik tidak valid.");
  return value;
}
export function spreadsheetNumber(value: string): string | number {
  numericText(value);
  const decimal = new ExactDecimal(value),
    number = Number(value);
  // Uang integer di luar rentang aman JS ditulis teks, termasuk yang berakhiran nol.
  return decimal.sd() <= 15 &&
    (!decimal.isInteger() || Number.isSafeInteger(number))
    ? number
    : value;
}
export function tabularCsv(headers: string[], rows: ExportCell[][]) {
  return (
    "\uFEFF" +
    [
      headers.map(safeCsvText).join(","),
      ...rows.map((row) =>
        row
          .map((cell) =>
            cell && typeof cell === "object"
              ? numericText(cell.number)
              : safeCsvText(cell ?? ""),
          )
          .join(","),
      ),
    ].join("\r\n") +
    "\r\n"
  );
}
export async function tabularXlsx(
  sheetName: string,
  headers: string[],
  rows: ExportCell[][],
  info: (string | number)[][],
) {
  return tabularWorkbook([{ name: sheetName, headers, rows }], info);
}
export type ExportSheet = {
  name: string;
  headers: string[];
  rows: ExportCell[][];
  widths?: number[];
  money?: number[];
  notes?: string[];
};
export async function tabularWorkbook(
  specs: ExportSheet[],
  info: (string | number)[][],
) {
  const book = new ExcelJS.Workbook();
  book.creator = "CV Ihsan Mandiri";
  book.created = new Date();
  const chunk = 1_048_575;
  for (const { name: sheetName, headers, rows, widths, money } of specs)
    for (let i = 0; i < Math.max(1, Math.ceil(rows.length / chunk)); i++) {
      const sheet = book.addWorksheet(i ? `${sheetName} ${i + 1}` : sheetName, {
        views: [{ state: "frozen", ySplit: 1 }],
      });
      sheet.addRow(headers);
      sheet.columns.forEach((column, index) => {
        column.width = widths?.[index] ?? (index === 3 ? 48 : 25);
      });
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF145D4B" },
      };
      sheet.getRow(1).height = 26;
      for (const values of rows.slice(i * chunk, (i + 1) * chunk)) {
        const row = sheet.addRow(
          values.map((cell) =>
            cell && typeof cell === "object"
              ? spreadsheetNumber(cell.number)
              : cell,
          ),
        );
        row.alignment = { vertical: "top", wrapText: true };
        values.forEach((cell, index) => {
          if (cell && typeof cell === "object")
            row.getCell(index + 1).numFmt =
              typeof row.getCell(index + 1).value === "number"
                ? money?.includes(index)
                  ? '"Rp" #,##0'
                  : "#,##0.###"
                : "@";
        });
      }
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: sheet.rowCount, column: headers.length },
      };
    }
  const metadata = book.addWorksheet("Keterangan");
  metadata.columns = [{ width: 28 }, { width: 100 }];
  metadata.addRows([
    ["Perusahaan", "CV Ihsan Mandiri"],
    [
      "Dibuat (WIB)",
      new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "long",
        timeZone: "Asia/Jakarta",
      }).format(book.created),
    ],
    ...info,
    [
      "Presisi",
      "Angka melebihi 15 digit signifikan atau integer di luar rentang aman JS ditulis sebagai teks agar tetap tepat di Excel.",
    ],
  ]);
  metadata.eachRow((row) => {
    row.alignment = { wrapText: true, vertical: "top" };
  });
  return new Uint8Array(await book.xlsx.writeBuffer());
}
