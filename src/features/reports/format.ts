import type { FinanceSummary } from "@/features/cash/schema";
import type { IncomeReportRow } from "./schema";
import { displayDate } from "@/lib/date";
export const incomeName = (row: IncomeReportRow) =>
  row.categoryName === row.productName
    ? row.categoryName
    : `${row.categoryName} / ${row.productName}`;
export function reportBalanceNote(finance: FinanceSummary) {
  return finance.balanceStatus === "NOT_CONFIGURED"
    ? "Saldo kas awal belum dikonfigurasi. Saldo awal/akhir belum dapat dihitung; arus kas tetap ditampilkan."
    : finance.balanceStatus === "BEFORE_OPENING"
      ? `Awal periode mendahului tanggal efektif pembukaan ${displayDate(finance.openingDate!)}. Pilih awal periode pada atau setelah tanggal tersebut untuk menghitung saldo awal/akhir.`
      : "";
}
