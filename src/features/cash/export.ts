import "server-only";
import {
  tabularCsv,
  tabularXlsx,
  type ExportCell,
} from "@/lib/spreadsheet-export";
import { expenseGroups } from "@/features/expenses/schema";
import {
  cashTypes,
  incomeKinds,
  type CashRow,
  type CashFilters,
} from "./schema";
export const cashHeaders = [
  "Kode Transaksi",
  "Tanggal",
  "Jenis",
  "Keterangan",
  "Jumlah (Rp)",
  "Pos Pengeluaran",
  "Kelompok Historis",
  "Jenis Pemasukan",
  "Kategori",
  "Produk / Subkategori",
  "Pesanan",
  "Kuantitas Terjual",
  "Satuan",
  "Status Kuantitas",
];
function cells(row: CashRow): ExportCell[] {
  return [
    row.id,
    row.transactionDate,
    cashTypes[row.type],
    row.description,
    { number: row.amount },
    row.expensePostName,
    row.expenseGroupSnapshot ? expenseGroups[row.expenseGroupSnapshot] : null,
    row.incomeKind ? incomeKinds[row.incomeKind] : null,
    row.categoryNameSnapshot,
    row.productNameSnapshot,
    row.orderNumber,
    row.soldQuantity === null ? null : { number: row.soldQuantity },
    row.soldUnit,
    row.incomeKind === "SALE"
      ? row.soldQuantity === null
        ? "Belum dicatat"
        : "Dicatat eksplisit"
      : "Tidak berlaku",
  ];
}
export const cashCsv = (rows: CashRow[]) =>
  tabularCsv(cashHeaders, rows.map(cells));
export const cashXlsx = (rows: CashRow[], filters: CashFilters) =>
  tabularXlsx("Buku Kas", cashHeaders, rows.map(cells), [
    ["Dokumen", "Daftar Buku Kas"],
    ["Jumlah hasil", rows.length],
    ["Jenis", filters.type ? cashTypes[filters.type] : "Semua"],
    ["Tanggal mulai", filters.start ?? "Semua"],
    ["Tanggal akhir", filters.end ?? "Semua"],
    ["Pencarian", filters.q || "Tidak ada"],
    [
      "Cakupan",
      "Seluruh hasil filter aktif, termasuk hasil di luar halaman tabel.",
    ],
    [
      "Saldo pembukaan",
      "Disimpan sebagai pengaturan terpisah, bukan transaksi pemasukan.",
    ],
    [
      "Kuantitas",
      "Hanya angka yang dicatat pada penerimaan ini; kosong berarti belum diketahui.",
    ],
  ]);
