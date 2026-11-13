import { ExactDecimal } from "@/lib/money";
import { monthRange } from "@/lib/date";
import type { AssetRow } from "./schema";
const monthIndex = (date: string) =>
  Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
// Beban dibukukan pada akhir bulan. Selisih pembulatan kumulatif memastikan
// seluruh beban tepat sama dengan harga perolehan, termasuk Rupiah yang tersisa.
export function assetDepreciation(asset: AssetRow, start: string, end: string) {
  const first = monthIndex(asset.startDate);
  const last = Math.min(
    first + asset.usefulMonths - 1,
    asset.stopDate ? monthIndex(asset.stopDate) : Infinity,
  );
  const through = (date: string) => {
    let month = monthIndex(date);
    const { end: monthEnd } = monthRange(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)),
    );
    if (date < monthEnd) month--;
    const count = Math.max(0, Math.min(month, last) - first + 1);
    return new ExactDecimal(asset.acquisitionCost)
      .mul(count)
      .div(asset.usefulMonths)
      .toDecimalPlaces(0, ExactDecimal.ROUND_HALF_UP);
  };
  const previous = new Date(`${start}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  const before =
    start === "0001-01-01"
      ? new ExactDecimal(0)
      : through(previous.toISOString().slice(0, 10));
  const accumulated = through(end);
  return {
    amount: accumulated.sub(before).toFixed(0),
    accumulated: accumulated.toFixed(0),
    bookValue: new ExactDecimal(asset.acquisitionCost)
      .sub(accumulated)
      .toFixed(0),
  };
}
