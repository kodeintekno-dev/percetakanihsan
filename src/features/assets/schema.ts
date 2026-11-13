import { z } from "zod";
import { businessDateSchema, recordId, revisionSchema } from "@/lib/validation";
export const assetSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1, "Nama aset wajib diisi.").max(200),
    acquisitionCost: z
      .string()
      .regex(
        /^[1-9]\d{0,17}$/,
        "Isi harga perolehan dalam Rupiah utuh, lebih dari nol.",
      ),
    startDate: businessDateSchema,
    usefulMonths: z.coerce.number().int().min(1).max(1200),
    purchaseCashId: recordId.nullable().default(null),
    updatedAt: revisionSchema.optional(),
  })
  .strict();
export const assetStopSchema = z
  .object({
    stopDate: businessDateSchema.nullable(),
    updatedAt: revisionSchema,
  })
  .strict();
export type AssetRow = {
  id: string;
  name: string;
  acquisitionCost: string;
  startDate: string;
  usefulMonths: number;
  stopDate: string | null;
  purchaseCashId: string | null;
  updatedAt: string;
};
