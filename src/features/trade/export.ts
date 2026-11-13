import "server-only";
import {
  tabularCsv,
  tabularWorkbook,
  type ExportCell,
  type ExportSheet,
} from "@/lib/spreadsheet-export";
import {
  tradeKinds,
  tradeStatuses,
  type InvoiceRow,
  type TradeFilters,
} from "./schema";
import type { ExportPayment, TradeExportData } from "./export-data";
const n = (value: string): ExportCell => ({ number: value });
export const invoiceHeaders = [
  "Kode Tagihan",
  "Jenis Tagihan",
  "Nomor Tagihan",
  "Pelanggan / Pemasok",
  "Pesanan",
  "Tanggal Tagihan",
  "Jatuh Tempo",
  "Total Tagihan (Rp)",
  "Dibayar (Rp)",
  "Sisa Tagihan (Rp)",
  "Status Tagihan",
  "Lewat Jatuh Tempo",
  "Pos Pengeluaran",
  "Catatan",
  "Dibatalkan Pada",
  "Alasan Pembatalan",
];
export function invoiceCells(r: InvoiceRow): ExportCell[] {
  return [
    r.id,
    tradeKinds[r.kind],
    r.reference,
    r.partyName,
    r.orderNumber,
    r.issueDate,
    r.dueDate,
    n(r.amount),
    n(r.paidAmount),
    n(r.remaining),
    tradeStatuses[r.status],
    r.overdue ? "Ya" : "Tidak",
    r.expensePostName,
    r.notes,
    r.cancelledAt,
    r.cancelReason,
  ];
}
export const paymentHeaders = [
  "Kode Pembayaran",
  "Kode Tagihan",
  "Nomor Tagihan",
  "Jenis Tagihan",
  "Pelanggan / Pemasok",
  "Pesanan",
  "Tanggal Kas",
  "Kode Transaksi Kas",
  "Nominal Pembayaran (Rp)",
  "Sumber Pembayaran",
  "Status Pembayaran",
  "Catatan",
  "Keterangan Kas",
  "Dibatalkan / Dilepas Pada",
  "Alasan",
];
const source = (p: ExportPayment) =>
  p.createdCash ? "Dibuat dari tagihan" : "Transaksi Buku Kas lama";
const status = (p: ExportPayment) =>
  p.voidedAt
    ? p.createdCash
      ? "Pembayaran dibatalkan"
      : "Tautan dilepas"
    : "Aktif";
export function paymentCells(p: ExportPayment): ExportCell[] {
  return [
    p.id,
    p.invoiceId,
    p.reference,
    tradeKinds[p.kind],
    p.partyName,
    p.orderNumber,
    p.transactionDate,
    p.cashId,
    n(p.amount),
    source(p),
    status(p),
    p.notes,
    p.description,
    p.voidedAt,
    p.voidReason,
  ];
}
export const tradeExportNotes = [
  "Tagihan dan pembayaran adalah dua rincian berbeda. Nominal pembayaran sudah masuk Buku Kas; jangan dijumlahkan ulang sebagai kas baru.",
  "Tagihan dibatalkan bukan kewajiban aktif. Riwayat pembayaran dibatalkan atau tautan dilepas tidak mengurangi sisa aktif. Saring status sebelum menjumlah.",
  "Pencatatan tagihan tidak otomatis menjadi pendapatan/beban. Laporan masih memakai kas tercatat dan penyesuaian penyusutan.",
];
export function tradeSheets(
  data: TradeExportData,
  split = false,
): ExportSheet[] {
  const specs: ExportSheet[] = (
    split ? (["RECEIVABLE", "PAYABLE"] as const) : [null]
  ).map((kind) => ({
    name:
      kind === "RECEIVABLE"
        ? "Piutang"
        : kind === "PAYABLE"
          ? "Hutang"
          : "Tagihan",
    headers: invoiceHeaders,
    rows: data.invoices
      .filter((r) => !kind || r.kind === kind)
      .map(invoiceCells),
    money: [7, 8, 9],
    widths: [30, 23, 27, 32, 28, 18, 18, 25, 25, 25, 24, 20, 28, 45, 28, 40],
    notes: [data.basis, ...tradeExportNotes],
  }));
  specs.push({
    name: split ? "Pembayaran Tagihan" : "Pembayaran",
    headers: paymentHeaders,
    rows: data.payments.map(paymentCells),
    money: [8],
    widths: [30, 30, 27, 23, 32, 28, 18, 30, 25, 28, 26, 40, 50, 28, 40],
    notes: [data.basis, ...tradeExportNotes],
  });
  return specs;
}
export const tradeCsvHeaders = [
  "jenis_baris",
  "kode_tagihan",
  "jenis_tagihan",
  "nomor_tagihan",
  "pihak",
  "pesanan",
  "tanggal_tagihan",
  "jatuh_tempo",
  "nilai_tagihan",
  "dibayar",
  "sisa",
  "status_tagihan",
  "lewat_jatuh_tempo",
  "pos_pengeluaran",
  "catatan_tagihan",
  "tanggal_pembatalan_tagihan",
  "alasan_pembatalan_tagihan",
  "kode_pembayaran",
  "kode_transaksi_kas",
  "tanggal_pembayaran",
  "nominal_pembayaran",
  "sumber_pembayaran",
  "status_pembayaran",
  "catatan_pembayaran",
  "keterangan_kas",
  "tanggal_pembatalan_pembayaran",
  "alasan_pembatalan_pembayaran",
];
export function tradeCsvRows(data: TradeExportData): ExportCell[][] {
  return [
    ...data.invoices.map((r) => [
      "TAGIHAN",
      ...invoiceCells(r),
      ...Array<null>(10).fill(null),
    ]),
    ...data.payments.map((p) => [
      "PEMBAYARAN",
      p.invoiceId,
      tradeKinds[p.kind],
      p.reference,
      p.partyName,
      p.orderNumber,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      p.id,
      p.cashId,
      p.transactionDate,
      n(p.amount),
      source(p),
      status(p),
      p.notes,
      p.description,
      p.voidedAt,
      p.voidReason,
    ]),
  ];
}
export const tradeCsv = (data: TradeExportData) =>
  tabularCsv(tradeCsvHeaders, tradeCsvRows(data));
export const tradeXlsx = (data: TradeExportData, filters: TradeFilters) =>
  tabularWorkbook(tradeSheets(data), [
    ["Dokumen", tradeKinds[filters.kind]],
    ["Pencarian", filters.q || "Semua"],
    ["Status", filters.status ? tradeStatuses[filters.status] : "Semua aktif"],
    ["Jumlah tagihan", data.invoices.length],
    ["Jumlah riwayat pembayaran", data.payments.length],
    ["Cakupan", data.basis],
    ...tradeExportNotes.map((note) => ["Catatan", note]),
  ]);
