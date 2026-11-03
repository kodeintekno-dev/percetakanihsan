import { ExactDecimal, MAX_RUPIAH, orderTotal } from "@/lib/money";
export type MarginMode = "PERCENT_MARKUP" | "FIXED_AMOUNT";
export type CostMathInput = { quantity: string; unitCost: string };
export type BudgetMathInput = {
  quantity: string;
  items: CostMathInput[];
  marginMode: MarginMode;
  marginValue: string;
};
export type BudgetCalculation = {
  lineTotals: string[];
  totalHpp: string;
  hppPerUnit: string;
  profitTotal: string;
  suggestedSellingTotal: string;
  suggestedSellingPerUnit: string;
};
export class BudgetCalculationError extends Error {
  constructor(
    message: string,
    public field: string,
  ) {
    super(message);
    this.name = "BudgetCalculationError";
  }
}
export function positiveQuantity(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{1,15}(?:[.,]\d{1,3})?$/.test(value.trim()) ||
    !new ExactDecimal(value.trim().replace(",", ".")).gt(0)
  )
    throw new BudgetCalculationError(
      "Isi jumlah positif, maksimal 15 digit dan tiga desimal.",
      "quantity",
    );
  return value.trim().replace(",", ".");
}
export function wholeCost(value: unknown): string {
  if (typeof value !== "string" || !/^\d{1,18}$/.test(value.trim()))
    throw new BudgetCalculationError(
      "Isi Rupiah utuh tidak negatif, maksimal 18 digit.",
      "unitCost",
    );
  return value.trim();
}
export function profitValue(value: unknown, mode: MarginMode): string {
  const regex =
    mode === "FIXED_AMOUNT" ? /^\d{1,18}$/ : /^\d{1,18}(?:[.,]\d{1,2})?$/;
  if (typeof value !== "string" || !regex.test(value.trim()))
    throw new BudgetCalculationError(
      mode === "FIXED_AMOUNT"
        ? "Keuntungan nominal berupa Rupiah utuh tidak negatif."
        : "Persentase tidak negatif, maksimal dua desimal.",
      "marginValue",
    );
  return value.trim().replace(",", ".");
}
export function calculateBudget(input: BudgetMathInput): BudgetCalculation {
  const quantity = positiveQuantity(input.quantity);
  if (!["PERCENT_MARKUP", "FIXED_AMOUNT"].includes(input.marginMode))
    throw new BudgetCalculationError("Pilih mode keuntungan.", "marginMode");
  const margin = profitValue(input.marginValue, input.marginMode),
    lineTotals = input.items.map((item, index) => {
      try {
        const amount = orderTotal(
          positiveQuantity(item.quantity),
          wholeCost(item.unitCost),
        );
        if (new ExactDecimal(amount).gt(MAX_RUPIAH))
          throw new BudgetCalculationError(
            "Subtotal melampaui kapasitas Rupiah 18 digit.",
            "unitCost",
          );
        return amount;
      } catch (error) {
        if (error instanceof BudgetCalculationError)
          throw new BudgetCalculationError(
            `Komponen ${index + 1}: ${error.message}`,
            "items",
          );
        throw error;
      }
    });
  const hpp = lineTotals.reduce(
    (sum, value) => sum.add(value),
    new ExactDecimal(0),
  );
  const profit = (
    input.marginMode === "PERCENT_MARKUP"
      ? hpp.mul(margin).div(100)
      : new ExactDecimal(margin)
  ).toDecimalPlaces(0);
  const selling = hpp.add(profit);
  if (hpp.gt(MAX_RUPIAH) || selling.gt(MAX_RUPIAH))
    throw new BudgetCalculationError(
      "Total HPP atau harga rekomendasi melampaui kapasitas Rupiah 18 digit.",
      "items",
    );
  return {
    lineTotals,
    totalHpp: hpp.toFixed(0),
    hppPerUnit: hpp.div(quantity).toFixed(4),
    profitTotal: profit.toFixed(0),
    suggestedSellingTotal: selling.toFixed(0),
    suggestedSellingPerUnit: selling.div(quantity).toFixed(4),
  };
}
