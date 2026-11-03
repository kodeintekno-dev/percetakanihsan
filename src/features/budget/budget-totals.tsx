import type { BudgetCalculation } from "@/lib/calculations/budget";
import { formatRupiah } from "@/lib/money";
import { formatUnitRupiah } from "./format";
export function BudgetTotals({
  totals,
  quantity,
}: {
  totals: BudgetCalculation | null;
  quantity: string;
}) {
  return (
    <div className="budget-total-grid" aria-label="Hasil estimasi HPP">
      {[
        {
          label: "Total estimasi HPP",
          value: totals ? formatRupiah(totals.totalHpp) : "—",
        },
        {
          label: "HPP per unit",
          value: totals ? formatUnitRupiah(totals.totalHpp, quantity) : "—",
        },
        {
          label: "Keuntungan total",
          value: totals ? formatRupiah(totals.profitTotal) : "—",
        },
        {
          label: "Rekomendasi harga total",
          value: totals ? formatRupiah(totals.suggestedSellingTotal) : "—",
        },
        {
          label: "Rekomendasi harga per unit",
          value: totals
            ? formatUnitRupiah(totals.suggestedSellingTotal, quantity)
            : "—",
        },
      ].map((c) => (
        <div key={c.label}>
          <span>{c.label}</span>
          <output>{c.value}</output>
        </div>
      ))}
    </div>
  );
}
