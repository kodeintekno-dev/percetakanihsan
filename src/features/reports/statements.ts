import { z } from "zod";
import { ExactDecimal, formatRupiah } from "@/lib/money";
import { displayDate } from "@/lib/date";
import type { ReportData } from "./schema";

export const statementKinds = {
  neraca: "Neraca",
  "laba-rugi": "Laba Rugi",
  "arus-kas": "Arus Kas",
} as const;
export const statementKindSchema = z.enum(["neraca", "laba-rugi", "arus-kas"]);
export type StatementKind = z.infer<typeof statementKindSchema>;
export type StatementRow = {
  label: string;
  amount: string | null;
  style: "section" | "item" | "subtotal" | "total";
};
export type FinancialStatement = {
  kind: StatementKind;
  title: string;
  period: string;
  rows: StatementRow[];
  notes: string[];
  issues: string[];
  status: "draft" | "ready";
};
export const automaticReportLabel = "Disusun otomatis dari data tercatat";
const sum = (...values: string[]) =>
  values.reduce((total, value) => total.add(value), new ExactDecimal(0)).toFixed(0);
const subtract = (a: string, ...b: string[]) => new ExactDecimal(a).sub(sum(...b)).toFixed(0);
const negative = (value: string) => new ExactDecimal(value).neg().toFixed(0);

/** Pure, read-only projection. No manual balance or classification overrides. */
export function buildStatement(data: ReportData, kind: StatementKind): FinancialStatement {
  const rows: StatementRow[] = [], issues: string[] = [], notes: string[] = [];
  const section = (label: string) => rows.push({ label, amount: null, style: "section" });
  const line = (label: string, amount: string | null, style: StatementRow["style"] = "item") =>
    rows.push({ label, amount, style });
  const report: FinancialStatement = {
    kind, title: statementKinds[kind],
    period: kind === "neraca"
      ? `Per ${displayDate(data.period.end)}`
      : `${displayDate(data.period.start)} – ${displayDate(data.period.end)}`,
    rows, notes, issues, status: "ready",
  };

  if (kind === "neraca") {
    const cash = data.balanceCash === undefined ? data.finance.closingBalance : data.balanceCash;
    const accumulated = sum(...data.assets.rows.map(asset => asset.accumulated));
    const netAssets = sum(...data.assets.rows.map(asset => asset.bookValue));
    const totalAssets = cash === null ? null : sum(cash, data.trade.receivableRemaining, netAssets);
    const liabilities = data.trade.payableRemaining;
    // This residual is total equity, not evidence of a particular owner contribution or retained earnings.
    const equity = totalAssets === null ? null : subtract(totalAssets, liabilities);
    section("ASET");
    line("Kas", cash);
    line("Piutang pelanggan tercatat", data.trade.receivableRemaining);
    line("Harga perolehan aset tetap", sum(netAssets, accumulated));
    line("Akumulasi penyusutan", negative(accumulated));
    line("Nilai buku aset tetap", netAssets, "subtotal");
    line("TOTAL ASET", totalAssets, "total");
    section("HUTANG");
    line("Hutang pemasok tercatat", liabilities);
    line("Total hutang", liabilities, "subtotal");
    section("EKUITAS");
    line("Ekuitas (total aset dikurangi total hutang)", equity, "subtotal");
    line("TOTAL HUTANG DAN EKUITAS", equity === null ? null : sum(liabilities, equity), "total");
    if (totalAssets === null)
      issues.push("Saldo kas belum dapat dihitung. Periksa saldo pembukaan kas dan tanggal laporan.");
    if (data.opening)
      notes.push(data.opening.date > data.period.end
        ? `Saldo pembukaan ${formatRupiah(data.opening.amount)} baru berlaku mulai ${displayDate(data.opening.date)}, setelah tanggal neraca ini.`
        : `Kas mencakup saldo pembukaan ${formatRupiah(data.opening.amount)} pada ${displayDate(data.opening.date)}, ditambah kas masuk dan dikurangi kas keluar sampai tanggal neraca.`);
    notes.push("Ekuitas dihitung otomatis dari aset dikurangi hutang tercatat. Modal pemilik dan saldo laba tidak dipisahkan karena sumber dananya belum dicatat terpisah.");
    notes.push("Cakupan: kas, piutang/hutang tagihan dan aset tetap yang tercatat. Pos yang belum dicatat tidak ditambahkan atau dianggap nol. Koreksi mengikuti data aktif terkini.");
  } else if (kind === "laba-rugi") {
    const operatingCosts = subtract(data.finance.expense, data.assets.purchases);
    const valid = !new ExactDecimal(operatingCosts).isNegative();
    const costs = valid ? sum(operatingCosts, data.assets.depreciation) : null;
    section("PENDAPATAN");
    line("Pendapatan penjualan diterima", data.income.saleAmount);
    line("Pemasukan lain-lain tercatat", data.income.otherAmount);
    line("Total pendapatan", data.finance.income, "subtotal");
    section("BIAYA");
    line("Pengeluaran produksi", data.finance.groups.PRODUCTION);
    line("Pengeluaran operasional", data.finance.groups.OPERATIONAL);
    line("Pengeluaran pemasaran", data.finance.groups.MARKETING);
    line("Dikurangi pembelian aset tertaut", negative(data.assets.purchases));
    line("Beban penyusutan", data.assets.depreciation);
    line("Total biaya", costs, "subtotal");
    line("LABA / RUGI PERIODE BERJALAN", costs === null ? null : subtract(data.finance.income, costs), "total");
    if (!valid) issues.push("Pembelian aset tertaut melebihi kas keluar. Periksa transaksi aset yang tercatat.");
    notes.push("Basis kas dengan penyusutan: pendapatan/biaya mengikuti Buku Kas; tagihan belum dibayar belum otomatis menjadi pendapatan/biaya. Laporan ini belum berbasis akrual penuh.");
    notes.push("Pembelian aset tertaut dikeluarkan dari biaya; beban penyusutan tidak mengurangi kas.");
    if (data.income.otherAmount !== "0")
      notes.push("Pemasukan lain-lain mengikuti pencatatan Buku Kas; sumber modal, pinjaman dan penjualan aset belum dapat dipisahkan otomatis dari data ini.");
  } else {
    const operatingOut = subtract(data.finance.expense, data.assets.purchases);
    const valid = !new ExactDecimal(operatingOut).isNegative();
    line("SALDO KAS AWAL", data.finance.openingBalance, "total");
    section("KAS KEGIATAN USAHA TERCATAT");
    line("Penerimaan penjualan", data.income.saleAmount);
    line("Pemasukan lain-lain sesuai Buku Kas", data.income.otherAmount);
    line("Pembayaran selain pembelian aset tertaut", valid ? negative(operatingOut) : null);
    line("Kas bersih selain investasi tertaut", valid ? subtract(data.finance.income, operatingOut) : null, "subtotal");
    section("INVESTASI ASET TERTAUT");
    line("Pembelian aset tertaut", negative(data.assets.purchases));
    line("Kas bersih investasi tertaut", negative(data.assets.purchases), "subtotal");
    line("KENAIKAN / PENURUNAN KAS", data.finance.net, "total");
    line("SALDO KAS AKHIR", data.finance.closingBalance, "total");
    if (!valid) issues.push("Pembelian aset tertaut melebihi kas keluar. Periksa transaksi aset yang tercatat.");
    if (data.finance.openingBalance === null || data.finance.closingBalance === null)
      issues.push("Saldo kas awal/akhir belum dapat dihitung. Periksa saldo pembukaan kas dan tanggal laporan.");
    notes.push("Saldo kas awal ditambah kenaikan/penurunan kas sama dengan saldo kas akhir. Pembelian aset tertaut dipisahkan otomatis; penyusutan tidak mengurangi kas.");
    notes.push("Arus kas mengikuti transaksi yang sudah tercatat. Modal, pinjaman dan hasil penjualan aset belum memiliki klasifikasi terpisah dalam Buku Kas, sehingga tidak ditebak sebagai arus pendanaan/investasi.");
  }
  report.status = issues.length ? "draft" : "ready";
  return report;
}
