import { z } from "zod";
import { validBusinessDate } from "./date";
export const recordId = z.string().min(1).max(100);
export const businessDateSchema = z
  .string()
  .refine(validBusinessDate, "Tanggal tidak valid.");
export const revisionSchema = z
  .string()
  .datetime({
    offset: true,
    error: "Versi data tidak valid. Muat ulang halaman.",
  });
export function queryObject(
  input: URLSearchParams | Record<string, unknown>,
): Record<string, unknown> {
  if (!(input instanceof URLSearchParams)) return input;
  return Object.fromEntries(
    [...new Set(input.keys())].map((key) => {
      const values = input.getAll(key);
      return [key, values.length === 1 ? values[0] : values];
    }),
  );
}
