import { z } from "zod";
import { masterName } from "@/features/categories/schema";
export const expenseGroups = {
  PRODUCTION: "Produksi",
  OPERATIONAL: "Operasional",
  MARKETING: "Marketing",
} as const;
export const expenseSchema = z
  .object({
    name: masterName,
    group: z.enum(["PRODUCTION", "OPERATIONAL", "MARKETING"], {
      error: "Pilih kelompok yang valid.",
    }),
    isActive: z.boolean().default(true),
  })
  .strict();
export type ExpenseRow = {
  id: string;
  name: string;
  group: keyof typeof expenseGroups;
  isActive: boolean;
  usage: number;
};
