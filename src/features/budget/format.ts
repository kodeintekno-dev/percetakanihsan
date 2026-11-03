import { ExactDecimal, formatRupiah } from "@/lib/money";
export function formatUnitRupiah(total: string, quantity: string) {
  const [whole, fraction] = new ExactDecimal(total)
    .div(quantity.replace(",", "."))
    .toFixed(2)
    .split(".");
  return `${formatRupiah(whole)},${fraction}`;
}
export const displayInstant = (value: string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value)) + " WIB";
