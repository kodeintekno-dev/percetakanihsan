import "server-only";
import ExcelJS from "exceljs";
import { safeCsvText, spreadsheetNumber } from "@/lib/spreadsheet-export";
export { safeCsvText } from "@/lib/spreadsheet-export";
import { orderStatuses, type OrderRow, type OrderFilters } from "./schema";
export const exportHeaders = [
  "Kode Permintaan",
  "Tanggal Pesanan",
  "Nama Pelanggan",
  "Kategori",
  "Produk / Subkategori",
  "Jumlah",
  "Satuan",
  "Harga Satuan (Rp)",
  "Total Harga (Rp)",
  "Status",
  "Catatan",
];
export function exportValues(row: OrderRow) {
  return [
    row.orderNumber,
    row.orderDate,
    row.customerName,
    row.categoryNameSnapshot,
    row.productNameSnapshot,
    row.quantity,
    row.unit,
    row.unitPrice,
    row.totalPrice,
    orderStatuses[row.status],
    row.notes,
  ];
}
const numericColumns = new Set([5, 7, 8]);
export function ordersCsv(rows: OrderRow[]) {
  return (
    "\uFEFF" +
    [
      exportHeaders.map(safeCsvText).join(","),
      ...rows.map((row) =>
        exportValues(row)
          .map((value, index) =>
            numericColumns.has(index) ? value : safeCsvText(value),
          )
          .join(","),
      ),
    ].join("\r\n") +
    "\r\n"
  );
}

export async function ordersXlsx(rows: OrderRow[], filters: OrderFilters) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CV Ihsan Mandiri";
  workbook.created = new Date();
  // Bagi menjadi beberapa sheet jika mencapai batas baris Excel; tidak memotong hasil.
  const sheetSize = 1_048_575;
  const parts = Math.max(1, Math.ceil(rows.length / sheetSize));
  for (let part = 0; part < parts; part++) {
    const sheet = workbook.addWorksheet(
      part ? `Permintaan ${part + 1}` : "Permintaan",
      { views: [{ state: "frozen", ySplit: 1 }] },
    );
    sheet.addRow(exportHeaders);
    sheet.columns.forEach((column, index) => {
      column.width = [28, 18, 28, 24, 26, 16, 14, 23, 23, 18, 55][index];
    });
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF145D4B" },
    };
    sheet.getRow(1).height = 26;
    for (const row of rows.slice(part * sheetSize, (part + 1) * sheetSize)) {
      const values = exportValues(row).map((value, index) =>
        numericColumns.has(index) ? spreadsheetNumber(value) : value,
      );
      const added = sheet.addRow(values);
      added.alignment = { vertical: "top", wrapText: true };
      for (const index of numericColumns)
        added.getCell(index + 1).numFmt =
          typeof values[index] === "number"
            ? index === 5
              ? "#,##0.###"
              : '"Rp" #,##0'
            : "@";
    }
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, sheet.rowCount), column: exportHeaders.length },
    };
  }
  const info = workbook.addWorksheet("Keterangan");
  info.columns = [{ width: 28 }, { width: 100 }];
  info.addRows([
    ["Perusahaan", "CV Ihsan Mandiri"],
    ["Dokumen", "Daftar Permintaan Cetak"],
    [
      "Dibuat (WIB)",
      new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "long",
        timeZone: "Asia/Jakarta",
      }).format(workbook.created),
    ],
    ["Jumlah hasil", rows.length],
    ["Status", filters.status ? orderStatuses[filters.status] : "Semua"],
    ["Tanggal mulai", filters.start ?? "Semua"],
    ["Tanggal akhir", filters.end ?? "Semua"],
    ["Kata pencarian", filters.q || "Tidak ada"],
    [
      "Cakupan",
      "Seluruh hasil filter aktif, termasuk hasil di luar halaman tabel.",
    ],
    [
      "Presisi",
      "Angka dengan lebih dari 15 digit signifikan atau integer di luar rentang aman JS ditulis sebagai teks agar tetap tepat di Excel.",
    ],
    [
      "Catatan",
      "Nilai pesanan bukan kas masuk. Nama kategori/produk menggunakan snapshot historis.",
    ],
  ]);
  info.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
