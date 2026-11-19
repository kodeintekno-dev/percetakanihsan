import { z } from "zod";
import { ExactDecimal } from "@/lib/money";
import { displayDate } from "@/lib/date";
import type { ReportData } from "./schema";

export const statementKinds = {
  neraca: "Neraca",
  "laba-rugi": "Laba Rugi",
  "arus-kas": "Arus Kas",
} as const;
export const statementKindSchema = z.enum(["neraca", "laba-rugi", "arus-kas"]);
export type StatementKind = z.infer<typeof statementKindSchema>;
const amount = z.string().regex(/^\d{1,18}$/, "Isi Rupiah bulat tanpa pemisah, maksimal 18 digit.").transform(value => new ExactDecimal(value).toFixed(0));
const signed = z.string().regex(/^-?\d{1,18}$/, "Isi Rupiah bulat, maksimal 18 digit; nilai negatif diperbolehkan.").transform(value => new ExactDecimal(value).toFixed(0));
export const preparationSchema = z.object({
  capital: signed.nullable().default(null),
  retainedEarnings: signed.nullable().default(null),
  inventory: amount.default("0"),
  loans: amount.default("0"),
  otherAssets: amount.default("0"),
  otherLiabilities: amount.default("0"),
  customerAdvances: amount.default("0"),
  supplierAdvances: amount.default("0"),
  contributions: amount.default("0"),
  drawings: amount.default("0"),
  loanReceipts: amount.default("0"),
  loanRepayments: amount.default("0"),
  assetSales: amount.default("0"),
  additionalAssetPurchases: amount.default("0"),
  classificationConfirmed: z.boolean().default(false),
  balanceConfirmed: z.boolean().default(false),
  notes: z.string().trim().max(300).default("").transform(value => value.replace(/\s+/gu, " ")),
}).strict();
export type ReportPreparation = z.infer<typeof preparationSchema>;
export const preparationFields = [
  ["capital", "Modal per tanggal neraca", "balance", true],
  ["retainedEarnings", "Saldo laba/rugi per tanggal neraca", "balance", true],
  ["inventory", "Persediaan bahan", "balance", false],
  ["loans", "Sisa pinjaman", "balance", false],
  ["customerAdvances", "Uang muka pelanggan", "balance", false],
  ["supplierAdvances", "Uang muka kepada pemasok", "balance", false],
  ["otherAssets", "Aset lainnya", "balance", false],
  ["otherLiabilities", "Hutang lainnya", "balance", false],
  ["contributions", "Setoran modal dalam kas masuk", "period", false],
  ["loanReceipts", "Penerimaan pinjaman dalam kas masuk", "period", false],
  ["assetSales", "Hasil penjualan aset dalam kas masuk", "period", false],
  ["drawings", "Pengambilan pemilik dalam kas keluar", "period", false],
  ["loanRepayments", "Pembayaran pokok pinjaman dalam kas keluar", "period", false],
  ["additionalAssetPurchases", "Pembelian aset belum tertaut dalam kas keluar", "period", false],
] as const;
export type StatementRow = { label: string; amount: string | null; style: "section" | "item" | "subtotal" | "total" };
export type FinancialStatement = {
  kind: StatementKind;
  title: string;
  period: string;
  rows: StatementRow[];
  notes: string[];
  issues: string[];
  status: "draft" | "ready";
};
const sum = (...values: string[]) => values.reduce((s, v) => s.add(v), new ExactDecimal(0)).toFixed(0);
const subtract = (a: string, ...b: string[]) => new ExactDecimal(a).sub(sum(...b)).toFixed(0);
const negative = (value: string) => new ExactDecimal(value).neg().toFixed(0);

export function buildStatement(data: ReportData, kind: StatementKind, input: ReportPreparation = data.preparation?.values ?? preparationSchema.parse({})): FinancialStatement {
  const values = preparationSchema.parse(input), rows: StatementRow[] = [], issues: string[] = [], notes: string[] = [];
  const section = (label: string) => rows.push({ label, amount: null, style: "section" });
  const line = (label: string, amount: string | null, style: StatementRow["style"] = "item") => rows.push({ label, amount, style });
  const report: FinancialStatement = {
    kind, title: statementKinds[kind],
    period: kind === "neraca" ? `Per ${displayDate(data.period.end)}` : `${displayDate(data.period.start)} – ${displayDate(data.period.end)}`,
    rows, notes, issues, status: "draft",
  };
  if (kind === "neraca") {
    const accumulated = sum(...data.assets.rows.map(a => a.accumulated));
    const netAssets = sum(...data.assets.rows.map(a => a.bookValue));
    const totalAssets = data.finance.closingBalance === null ? null : sum(data.finance.closingBalance, data.trade.receivableRemaining, values.inventory, netAssets, values.otherAssets, values.supplierAdvances);
    const liabilities = sum(data.trade.payableRemaining, values.loans, values.otherLiabilities, values.customerAdvances);
    const equity = values.capital === null || values.retainedEarnings === null ? null : sum(values.capital, values.retainedEarnings);
    const right = equity === null ? null : sum(liabilities, equity);
    section("ASET");
    line("Kas", data.finance.closingBalance);
    line("Piutang pelanggan tercatat", data.trade.receivableRemaining);
    line("Persediaan bahan", values.inventory);
    line("Uang muka kepada pemasok", values.supplierAdvances);
    line("Harga perolehan aset tetap", sum(netAssets, accumulated));
    line("Akumulasi penyusutan", negative(accumulated));
    line("Nilai buku aset tetap", netAssets, "subtotal");
    line("Aset lainnya", values.otherAssets);
    line("TOTAL ASET", totalAssets, "total");
    section("HUTANG");
    line("Hutang pemasok tercatat", data.trade.payableRemaining);
    line("Pinjaman", values.loans);
    line("Uang muka pelanggan", values.customerAdvances);
    line("Hutang lainnya", values.otherLiabilities);
    line("Total hutang", liabilities, "subtotal");
    section("MODAL / EKUITAS");
    line("Modal pemilik", values.capital);
    line("Saldo laba/rugi", values.retainedEarnings);
    line("Total ekuitas", equity, "subtotal");
    line("TOTAL HUTANG DAN EKUITAS", right, "total");
    if (totalAssets === null) issues.push("Saldo kas belum tersedia. Periksa tanggal dan saldo pembukaan kas.");
    if (equity === null) issues.push("Modal dan saldo laba/rugi per tanggal neraca belum lengkap.");
    if (!values.balanceConfirmed) issues.push("Kelengkapan saldo neraca belum dikonfirmasi.");
    if (totalAssets !== null && right !== null) {
      const difference = subtract(totalAssets, right);
      if (difference !== "0") {
        issues.push("Total aset belum sama dengan total hutang dan ekuitas. Periksa saldo pelengkap.");
        line("Selisih yang perlu diperiksa", difference, "total");
      }
    }
    notes.push("Modal, saldo laba, persediaan, pinjaman dan uang muka berasal dari isian pelengkap per tanggal neraca. Saldo laba tidak diisi otomatis sebagai angka penyeimbang.");
    notes.push("Piutang/hutang hanya mencakup tagihan yang tercatat; periksa tagihan pesanan yang belum diserahkan dan uang muka agar tidak dihitung ganda. Koreksi mengikuti data aktif terkini.");
  } else {
    const nonOperatingIncome = sum(values.contributions, values.loanReceipts, values.assetSales);
    const purchases = sum(data.assets.purchases, values.additionalAssetPurchases);
    const nonExpense = sum(purchases, values.drawings, values.loanRepayments);
    const incomeValid = new ExactDecimal(nonOperatingIncome).lte(data.income.otherAmount);
    const expenseValid = new ExactDecimal(nonExpense).lte(data.finance.expense);
    if (!incomeValid) issues.push("Setoran modal, pinjaman dan penjualan aset melebihi pemasukan lain-lain tercatat. Periksa klasifikasinya.");
    if (!expenseValid) issues.push("Pengeluaran aset, pengambilan pemilik dan pokok pinjaman melebihi kas keluar tercatat.");
    if (!values.classificationConfirmed) issues.push("Klasifikasi modal, pinjaman dan aset dalam kas periode ini belum dikonfirmasi.");
    if (kind === "laba-rugi") {
      const revenue = incomeValid ? subtract(data.finance.income, nonOperatingIncome) : null;
      const costs = expenseValid ? subtract(data.finance.expense, nonExpense) : null;
      section("PENDAPATAN");
      line("Pendapatan penjualan diterima", data.income.saleAmount);
      line("Pendapatan lainnya diterima", incomeValid ? subtract(data.income.otherAmount, nonOperatingIncome) : null);
      line("Total pendapatan", revenue, "subtotal");
      section("BIAYA");
      line("Pengeluaran produksi", data.finance.groups.PRODUCTION);
      line("Pengeluaran operasional", data.finance.groups.OPERATIONAL);
      line("Pengeluaran pemasaran", data.finance.groups.MARKETING);
      line("Dikurangi pengeluaran aset dan pendanaan", expenseValid ? negative(nonExpense) : null);
      line("Beban penyusutan", data.assets.depreciation);
      const totalCosts = costs === null ? null : sum(costs, data.assets.depreciation);
      line("Total biaya", totalCosts, "subtotal");
      line("LABA / RUGI PERIODE BERJALAN", revenue === null || totalCosts === null ? null : subtract(revenue, totalCosts), "total");
      notes.push("Basis kas dengan penyusutan: tagihan belum dibayar belum otomatis menjadi pendapatan/biaya. Laporan ini belum berbasis akrual penuh.");
      notes.push("Pembelian aset dan pengeluaran pendanaan dikeluarkan dari biaya. Hasil penjualan aset dikeluarkan dari pendapatan kas; laba/rugi pelepasan aset belum dihitung.");
      if (values.assetSales !== "0") issues.push("Ada penjualan aset. Nilai buku dan laba/rugi pelepasan perlu diperhitungkan sebelum laporan dinyatakan lengkap.");
    } else {
      const operatingIn = incomeValid ? subtract(data.finance.income, nonOperatingIncome) : null;
      const operatingOut = expenseValid ? subtract(data.finance.expense, nonExpense) : null;
      line("SALDO KAS AWAL", data.finance.openingBalance, "total");
      section("KEGIATAN OPERASIONAL");
      line("Penerimaan kegiatan usaha", operatingIn);
      line("Pembayaran kegiatan usaha", operatingOut === null ? null : negative(operatingOut));
      line("Kas bersih operasional", operatingIn === null || operatingOut === null ? null : subtract(operatingIn, operatingOut), "subtotal");
      section("KEGIATAN INVESTASI");
      line("Hasil penjualan aset", values.assetSales);
      line("Pembelian aset", negative(purchases));
      line("Kas bersih investasi", subtract(values.assetSales, purchases), "subtotal");
      section("KEGIATAN PENDANAAN");
      line("Setoran modal", values.contributions);
      line("Penerimaan pinjaman", values.loanReceipts);
      line("Pengambilan pemilik", negative(values.drawings));
      line("Pembayaran pokok pinjaman", negative(values.loanRepayments));
      line("Kas bersih pendanaan", subtract(sum(values.contributions, values.loanReceipts), values.drawings, values.loanRepayments), "subtotal");
      line("KENAIKAN / PENURUNAN KAS", data.finance.net, "total");
      line("SALDO KAS AKHIR", data.finance.closingBalance, "total");
      if (data.finance.openingBalance === null || data.finance.closingBalance === null) issues.push("Saldo kas awal/akhir belum tersedia. Periksa pengaturan saldo pembukaan dan tanggal laporan.");
      notes.push("Seluruh klasifikasi merupakan bagian dari kas yang sudah tercatat, bukan tambahan kas. Penyusutan tidak mengurangi kas.");
    }
    notes.push("Isian pelengkap mengelompokkan kembali transaksi laporan ini tanpa mengubah Buku Kas. Periksa uang muka dan transaksi lain yang memerlukan penyesuaian.");
  }
  if (values.notes) notes.push(`Catatan pelengkap: ${values.notes}`);
  if (data.preparation?.stale) issues.push("Data sumber berubah sejak pelengkap disimpan. Periksa kembali dan simpan versi pelengkap baru.");
  const stored = data.preparation && data.preparation.version > 0 && JSON.stringify(values) === JSON.stringify(data.preparation.values);
  notes.push(stored ? `Pelengkap tersimpan versi ${data.preparation!.version}.` : "Pelengkap sementara untuk laporan ini; belum disimpan ke database.");
  report.status = issues.length ? "draft" : "ready";
  return report;
}
