import { z } from "zod";
import {
  recordId,
  revisionSchema,
  businessDateSchema,
  queryObject,
} from "@/lib/validation";
import {
  calculateCutting,
  calculateMaterial,
  dimensionUnits,
  CuttingError,
  type CuttingResult,
  type CutOrientation,
  type MaterialEstimate,
} from "@/lib/calculations/cutting";
import {
  calculateBudget,
  positiveQuantity,
  wholeCost,
  profitValue,
  BudgetCalculationError,
  type BudgetCalculation,
} from "@/lib/calculations/budget";
import { ExactDecimal } from "@/lib/money";
export const costTypes = {
  PAPER: "Bahan / kertas",
  INK_PRINT: "Tinta / plat / cetak",
  FINISHING: "Finishing",
  MACHINE_LABOR: "Mesin / tenaga kerja",
  CUSTOM: "Komponen lain",
} as const;
export const marginModes = {
  PERCENT_MARKUP: "Tambah keuntungan di atas HPP (%)",
  FIXED_AMOUNT: "Tambah keuntungan nominal (Rp)",
} as const;
function checked(validate: (value: string) => unknown, message: string) {
  return z
    .string()
    .trim()
    .refine((value) => {
      try {
        validate(value);
        return true;
      } catch {
        return false;
      }
    }, message)
    .transform((v) => v.replace(",", "."));
}
const quantity = checked(
  positiveQuantity,
  "Isi jumlah positif, maksimal 15 digit dan tiga desimal.",
);
const rupiah = checked(
  wholeCost,
  "Isi Rupiah utuh tidak negatif, maksimal 18 digit.",
);
const dimension = checked(
  (v) => dimensionUnits(v),
  "Isi cm positif, maksimal dua desimal dan 10 digit sebelum koma.",
);
export const materialInputSchema = z
  .object({
    requiredFinishedPieces: z
      .string()
      .trim()
      .regex(
        /^\d{1,15}$/,
        "Jumlah produk potong harus bilangan bulat positif, maksimal 15 digit.",
      )
      .refine(
        (v) => /^\d+$/.test(v) && BigInt(v) > 0n,
        "Jumlah produk potong harus lebih dari nol.",
      ),
    paperPricePerSheet: rupiah,
  })
  .strict();
export const paperInputSchema = z
  .object({
    sheetLengthCm: dimension,
    sheetWidthCm: dimension,
    cutLengthCm: dimension,
    cutWidthCm: dimension,
    selectedOrientation: z.enum(["original", "rotated"]),
    material: materialInputSchema.nullable(),
  })
  .strict();
export type PaperInput = z.infer<typeof paperInputSchema>;
export const costItemSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, "Nama komponen wajib diisi.")
      .max(150, "Maksimal 150 karakter."),
    costType: z.enum([
      "PAPER",
      "INK_PRINT",
      "FINISHING",
      "MACHINE_LABOR",
      "CUSTOM",
    ]),
    quantity,
    unitCost: rupiah,
    fromPaperCut: z.boolean().default(false),
  })
  .strict();
export type CostInput = z.infer<typeof costItemSchema>;
export const budgetSchema = z
  .object({
    title: z.string().trim().min(1, "Judul estimasi wajib diisi.").max(150),
    orderId: recordId.nullable().default(null),
    categoryId: recordId,
    subcategoryId: recordId.nullable().default(null),
    quantity,
    unit: z.string().trim().min(1, "Satuan wajib diisi.").max(30),
    marginMode: z.enum(["PERCENT_MARKUP", "FIXED_AMOUNT"]),
    marginValue: z.string().trim().max(21),
    items: z.array(costItemSchema),
    paperCut: paperInputSchema.nullable().default(null),
  })
  .strict()
  .superRefine((data, ctx) => {
    try {
      profitValue(data.marginValue, data.marginMode);
      calculateBudget(data);
    } catch (error) {
      if (error instanceof BudgetCalculationError)
        ctx.addIssue({
          code: "custom",
          path: [error.field],
          message: error.message,
        });
      else throw error;
    }
    const sourced = data.items
      .map((item, index) => ({ item, index }))
      .filter((v) => v.item.fromPaperCut);
    if (sourced.length > 1)
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message:
          "Hasil potong hanya boleh diterapkan pada satu komponen bahan; konfirmasi ulang mengganti baris yang sama.",
      });
    if (sourced.length && !data.paperCut?.material)
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message:
          "Komponen hasil potong membutuhkan simulasi dan jumlah/harga plano, atau ubah menjadi biaya manual.",
      });
    if (data.paperCut) {
      try {
        const cutting = calculateCutting(data.paperCut);
        const m = data.paperCut.material
          ? calculateMaterial(
              cutting,
              data.paperCut.selectedOrientation,
              data.paperCut.material.requiredFinishedPieces,
              data.paperCut.material.paperPricePerSheet,
            )
          : null;
        for (const { item, index } of sourced)
          if (
            m &&
            /^\d+(?:\.\d{1,3})?$/.test(item.quantity) &&
            /^\d+$/.test(item.unitCost) &&
            (item.costType !== "PAPER" ||
              !new ExactDecimal(item.quantity).eq(m.requiredParentSheets) ||
              !new ExactDecimal(item.unitCost).eq(m.paperPricePerSheet))
          )
            ctx.addIssue({
              code: "custom",
              path: ["items", index],
              message:
                "Biaya bahan tidak sesuai simulasi terkini. Konfirmasi pemindahan ulang atau jadikan biaya manual.",
            });
      } catch (error) {
        if (error instanceof CuttingError)
          ctx.addIssue({
            code: "custom",
            path: ["paperCut", error.field ?? "material"],
            message: error.message,
          });
        else throw error;
      }
    }
  });
export type BudgetInput = z.infer<typeof budgetSchema>;
export const updateBudgetSchema = z
  .object({ data: budgetSchema, updatedAt: revisionSchema })
  .strict();
export const deleteBudgetSchema = z
  .object({ updatedAt: revisionSchema })
  .strict();
const optional = (schema: z.ZodString) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());
export const budgetFilterSchema = z
  .object({
    q: z.string().trim().max(150).default(""),
    categoryId: optional(recordId),
    subcategoryId: optional(recordId),
    start: optional(businessDateSchema),
    end: optional(businessDateSchema),
    page: z.coerce.number().int().min(1).max(2147483647).default(1),
    pageSize: z.coerce
      .number()
      .pipe(
        z.union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)]),
      )
      .default(10),
  })
  .superRefine((v, ctx) => {
    if (v.subcategoryId && !v.categoryId)
      ctx.addIssue({
        code: "custom",
        path: ["subcategoryId"],
        message: "Pilih kategori utama terlebih dahulu.",
      });
    if (v.start && v.end && v.start > v.end)
      ctx.addIssue({
        code: "custom",
        path: ["end"],
        message: "Tanggal akhir harus sama atau setelah tanggal mulai.",
      });
  });
export type BudgetFilters = z.infer<typeof budgetFilterSchema>;
export const parseBudgetFilters = (
  input: URLSearchParams | Record<string, unknown>,
) => budgetFilterSchema.parse(queryObject(input));
export function budgetQuery(filters: BudgetFilters, page = filters.page) {
  const params = new URLSearchParams();
  for (const key of [
    "q",
    "categoryId",
    "subcategoryId",
    "start",
    "end",
  ] as const)
    if (filters[key]) params.set(key, filters[key]!);
  params.set("page", String(page));
  params.set("pageSize", String(filters.pageSize));
  return params.toString();
}
export type PaperSnapshot = {
  version: "uniform-grid-v1";
  calculation: CuttingResult;
  selectedOrientation: CutOrientation;
  material: MaterialEstimate | null;
};
export type BudgetSummary = {
  id: string;
  budgetNumber: string;
  title: string;
  orderId: string | null;
  orderNumberSnapshot: string | null;
  customerNameSnapshot: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  categoryNameSnapshot: string | null;
  productNameSnapshot: string | null;
  quantity: string;
  unit: string;
  marginMode: "PERCENT_MARKUP" | "FIXED_AMOUNT";
  marginValue: string;
  totalHpp: string;
  hppPerUnit: string;
  suggestedSellingTotal: string;
  suggestedSellingPerUnit: string;
  costCount: number;
  createdAt: string;
  updatedAt: string;
};
export type BudgetDetail = BudgetSummary & {
  items: (CostInput & { id: string; totalCost: string })[];
  paperCut: PaperInput | null;
  paperSnapshot: PaperSnapshot | null;
  legacySnapshot: boolean;
};
export type BudgetPage = {
  rows: BudgetSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
export function budgetCalculation(data: BudgetInput): {
  totals: BudgetCalculation;
  snapshot: PaperSnapshot | null;
} {
  const calculation = data.paperCut ? calculateCutting(data.paperCut) : null;
  return {
    totals: calculateBudget(data),
    snapshot:
      calculation && data.paperCut
        ? {
            version: "uniform-grid-v1",
            calculation,
            selectedOrientation: data.paperCut.selectedOrientation,
            material: data.paperCut.material
              ? calculateMaterial(
                  calculation,
                  data.paperCut.selectedOrientation,
                  data.paperCut.material.requiredFinishedPieces,
                  data.paperCut.material.paperPricePerSheet,
                )
              : null,
          }
        : null,
  };
}
