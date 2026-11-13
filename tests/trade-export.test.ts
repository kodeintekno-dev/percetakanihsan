import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { tradeCsv, tradeCsvHeaders, tradeXlsx } from "@/features/trade/export";
import {
  reportsCsv,
  reportsXlsx,
  reportCsvHeaders,
} from "@/features/reports/export";
import { cashCsv, cashHeaders } from "@/features/cash/export";
import { parseTradeFilters } from "@/features/trade/schema";
import type { TradeExportData } from "@/features/trade/export-data";
import { reportFixture } from "./fixtures/report";
function fixture(): TradeExportData {
  return {
    basis: "Seluruh hasil filter aktif",
    invoices: [
      {
        id: "inv",
        kind: "RECEIVABLE",
        reference: "=INV(1)",
        partyName: 'Pelanggan, "QA"',
        issueDate: "2026-11-01",
        dueDate: "2026-11-20",
        amount: "2000000",
        paidAmount: "800000",
        remaining: "1200000",
        status: "PARTIAL",
        overdue: false,
        orderId: "order",
        orderNumber: "PST-QA",
        expensePostId: null,
        expensePostName: null,
        notes: "dua\nbaris",
        updatedAt: "2026-11-13T00:00:00.000Z",
        cancelledAt: null,
        cancelReason: null,
      },
    ],
    payments: [
      {
        id: "pay",
        invoiceId: "inv",
        reference: "=INV(1)",
        kind: "RECEIVABLE",
        partyName: 'Pelanggan, "QA"',
        orderNumber: "PST-QA",
        cashId: "cash",
        amount: "800000",
        transactionDate: "2026-11-05",
        description: "DP lama",
        createdCash: false,
        notes: "@note",
        voidedAt: null,
        voidReason: null,
      },
    ],
  };
}
describe("Ekspor Hutang-Piutang dan hubungan kas", () => {
  it("CSV memisahkan tagihan/pembayaran, menjaga koma/baris, BOM, presisi dan formula", () => {
    const data = fixture();
    data.invoices[0].amount = "999999999999999999";
    const csv = tradeCsv(data),
      rows = parse(csv, { bom: true, columns: true }) as Record<
        string,
        string
      >[];
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("\r\n");
    expect(Object.keys(rows[0])).toEqual(tradeCsvHeaders);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      jenis_baris: "TAGIHAN",
      nomor_tagihan: "'=INV(1)",
      nilai_tagihan: "999999999999999999",
      nominal_pembayaran: "",
      pihak: 'Pelanggan, "QA"',
      catatan_tagihan: "dua\nbaris",
    });
    expect(rows[1]).toMatchObject({
      jenis_baris: "PEMBAYARAN",
      nilai_tagihan: "",
      dibayar: "",
      sisa: "",
      nominal_pembayaran: "800000",
      catatan_pembayaran: "'@note",
      kode_transaksi_kas: "cash",
    });
  });
  it("Excel berisi rincian terpisah, status pembatalan dan angka besar sebagai teks", async () => {
    const data = fixture();
    data.invoices[0].amount = "999999999999999999";
    data.payments[0].voidedAt = "2026-11-13T00:00:00Z";
    data.payments[0].voidReason = "Salah pilih";
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      Uint8Array.from(await tradeXlsx(data, parseTradeFilters({}))).buffer,
    );
    expect(book.worksheets.map((s) => s.name)).toEqual([
      "Tagihan",
      "Pembayaran",
      "Keterangan",
    ]);
    expect(book.getWorksheet("Tagihan")!.getCell("H2").value).toBe(
      "999999999999999999",
    );
    expect(book.getWorksheet("Tagihan")!.getCell("C2").type).toBe(
      ExcelJS.ValueType.String,
    );
    expect(book.getWorksheet("Pembayaran")!.getCell("K2").value).toBe(
      "Tautan dilepas",
    );
    expect(book.getWorksheet("Pembayaran")!.getCell("I2").value).toBe(800000);
  });
  it("laporan lengkap mempertahankan kas dan penyusutan, menambah tiga sheet serta kolom CSV tagihan", async () => {
    const data = reportFixture();
    data.trade = {
      ...fixture(),
      receivableRemaining: "1200000",
      payableRemaining: "0",
    };
    const rows = parse(reportsCsv(data), {
      bom: true,
      columns: true,
    }) as Record<string, string>[];
    expect(Object.keys(rows[0])).toEqual(reportCsvHeaders);
    expect(reportCsvHeaders).toHaveLength(40);
    expect(
      rows.find((r: Record<string, string>) => r.bagian === "tagihan_piutang"),
    ).toMatchObject({ nilai_tagihan: "2000000", nominal: "", sisa: "1200000" });
    expect(
      rows.find(
        (r: Record<string, string>) => r.bagian === "pembayaran_tagihan",
      ),
    ).toMatchObject({
      nominal_pembayaran: "800000",
      nominal: "",
      nilai_tagihan: "",
    });
    expect(
      rows.find(
        (r: Record<string, string>) =>
          r.bagian === "ringkasan" && r.subbagian === "kas_masuk",
      )?.nominal,
    ).toBe("1300000");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Uint8Array.from(await reportsXlsx(data)).buffer);
    expect(book.worksheets.map((s) => s.name).slice(-3)).toEqual([
      "Piutang",
      "Hutang",
      "Pembayaran Tagihan",
    ]);
    expect(book.getWorksheet("Piutang")!.getCell("J7").value).toBe(1200000);
    expect(book.getWorksheet("Ringkasan")!.getCell("C7").value).toBe(1300000);
  });
  it("ekspor kosong tetap bisa dibuka dan Buku Kas menyertakan referensi tagihan", async () => {
    const empty = fixture();
    empty.invoices = [];
    empty.payments = [];
    expect(parse(tradeCsv(empty), { bom: true })).toEqual([tradeCsvHeaders]);
    const rows = parse(
      cashCsv([
        {
          id: "cash",
          transactionDate: "2026-11-05",
          type: "INCOME",
          description: "DP",
          amount: "800000",
          expensePostId: null,
          expensePostName: null,
          expenseGroupSnapshot: null,
          incomeKind: "SALE",
          categoryId: "c",
          subcategoryId: null,
          categoryNameSnapshot: "Brosur",
          productNameSnapshot: "Brosur",
          orderId: "order",
          orderNumber: "PST-QA",
          orderCustomerName: "QA",
          soldQuantity: null,
          soldUnit: null,
          updatedAt: "2026-11-13T00:00:00Z",
          linkedInvoiceId: "inv",
          linkedInvoiceReference: "INV-1",
        },
      ]),
      { bom: true, columns: true },
    ) as Record<string, string>[];
    expect(Object.keys(rows[0])).toEqual(cashHeaders);
    expect(rows[0]["Nomor Tagihan"]).toBe("INV-1");
  });
});
