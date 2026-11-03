export function todayJakarta(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}
export function validBusinessDate(value: string) {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
// DATE PostgreSQL: simpan kalender bisnis tanpa mengubahnya menjadi hari UTC sebelumnya.
export const databaseDate = (value: string) =>
  new Date(`${value}T00:00:00.000Z`);
export const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
export const displayDate = (value: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(databaseDate(value));

export function currentMonthJakarta(now = new Date()) {
  const today = todayJakarta(now);
  const [year, month] = today.split("-").map(Number);
  const start = `${today.slice(0, 7)}-01`;
  const end = monthRange(year, month).end;
  const label = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(now);
  return { start, end, label };
}

export function monthRange(year: number, month: number) {
  if (
    !Number.isInteger(year) ||
    year < 1 ||
    year > 9999 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  )
    throw new Error("Bulan/tahun tidak valid.");
  const start = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  const endDate = databaseDate(start);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  endDate.setUTCDate(0);
  return { start, end: dateOnly(endDate) };
}
