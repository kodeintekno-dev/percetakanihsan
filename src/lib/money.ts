import Decimal from "decimal.js";
export const ExactDecimal = Decimal.clone({
  precision: 50,
  rounding: Decimal.ROUND_HALF_UP,
});
export const MAX_RUPIAH = "999999999999999999";
export function orderTotal(quantity: string, unitPrice: string) {
  return new ExactDecimal(quantity.replace(",", "."))
    .mul(unitPrice)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toFixed(0);
}
const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
export function formatRupiah(value: string) {
  return rupiah.format(BigInt(value));
}
export function formatQuantity(value: string) {
  const [whole, fraction] = value.split(".");
  const decimals = fraction?.replace(/0+$/, "");
  return `${new Intl.NumberFormat("id-ID").format(BigInt(whole))}${decimals ? `,${decimals}` : ""}`;
}
