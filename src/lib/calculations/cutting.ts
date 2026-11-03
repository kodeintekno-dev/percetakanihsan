import { ExactDecimal, MAX_RUPIAH } from "@/lib/money";

export const CUTTING_VERSION = "uniform-grid-v1";
export type CutOrientation = "original" | "rotated";
export type CutDimensions = {
  sheetLengthCm: string;
  sheetWidthCm: string;
  cutLengthCm: string;
  cutWidthCm: string;
};
export type CutGrid = {
  columns: string;
  rows: string;
  yield: string;
  pieceLengthCm: string;
  pieceWidthCm: string;
  remainingLengthCm: string;
  remainingWidthCm: string;
  usedAreaCm2: string;
  wasteAreaCm2: string;
  wastePercentRounded2: string;
};
export type CuttingResult = {
  version: typeof CUTTING_VERSION;
  input: CutDimensions;
  sheetAreaCm2: string;
  pieceAreaCm2: string;
  original: CutGrid;
  rotated: CutGrid;
  bestOrientation: CutOrientation;
  tied: boolean;
};
export type MaterialEstimate = {
  requiredFinishedPieces: string;
  paperPricePerSheet: string;
  requiredParentSheets: string;
  totalCost: string;
  extraPieces: string;
};
export class CuttingError extends Error {
  constructor(
    public code:
      | "invalid_dimension"
      | "invalid_material"
      | "zero_yield"
      | "amount_overflow",
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "CuttingError";
  }
}
// Decimal(12,2): maksimum 10 digit sebelum koma. Tidak membatasi yield ke Number/Int.
export function dimensionUnits(value: unknown, field?: string): bigint {
  if (
    typeof value !== "string" ||
    !/^\d{1,10}(?:[.,]\d{1,2})?$/.test(value.trim())
  )
    throw new CuttingError(
      "invalid_dimension",
      "Isi ukuran cm positif, maksimal dua desimal dan 10 digit sebelum koma.",
      field,
    );
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  const units = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (units <= 0n)
    throw new CuttingError(
      "invalid_dimension",
      "Ukuran harus lebih dari nol.",
      field,
    );
  return units;
}
function scaled(value: bigint, places: number) {
  const digits = value.toString().padStart(places + 1, "0"),
    whole = digits.slice(0, -places),
    fraction = digits.slice(-places).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}
export function calculateCutting(input: CutDimensions): CuttingResult {
  const lp = dimensionUnits(input.sheetLengthCm, "sheetLengthCm"),
    wp = dimensionUnits(input.sheetWidthCm, "sheetWidthCm"),
    lc = dimensionUnits(input.cutLengthCm, "cutLengthCm"),
    wc = dimensionUnits(input.cutWidthCm, "cutWidthCm");
  const sheetArea = lp * wp,
    pieceArea = lc * wc;
  function grid(x: bigint, y: bigint): CutGrid {
    // Pembagian bigint positif identik dengan FLOOR, masing-masing sumbu.
    const columns = lp / x,
      rows = wp / y,
      yieldCount = columns * rows,
      used = yieldCount * pieceArea,
      waste = sheetArea - used;
    return {
      columns: columns.toString(),
      rows: rows.toString(),
      yield: yieldCount.toString(),
      pieceLengthCm: scaled(x, 2),
      pieceWidthCm: scaled(y, 2),
      remainingLengthCm: scaled(lp - columns * x, 2),
      remainingWidthCm: scaled(wp - rows * y, 2),
      usedAreaCm2: scaled(used, 4),
      wasteAreaCm2: scaled(waste, 4),
      wastePercentRounded2: new ExactDecimal(waste.toString())
        .div(sheetArea.toString())
        .mul(100)
        .toFixed(2),
    };
  }
  const original = grid(lc, wc),
    rotated = grid(wc, lc);
  return {
    version: CUTTING_VERSION,
    input: {
      sheetLengthCm: scaled(lp, 2),
      sheetWidthCm: scaled(wp, 2),
      cutLengthCm: scaled(lc, 2),
      cutWidthCm: scaled(wc, 2),
    },
    sheetAreaCm2: scaled(sheetArea, 4),
    pieceAreaCm2: scaled(pieceArea, 4),
    original,
    rotated,
    bestOrientation:
      BigInt(rotated.yield) > BigInt(original.yield) ? "rotated" : "original",
    tied: original.yield === rotated.yield,
  };
}
export function calculateMaterial(
  result: CuttingResult,
  orientation: CutOrientation,
  requiredFinishedPieces: string,
  paperPricePerSheet: string,
): MaterialEstimate {
  if (
    !/^\d{1,15}$/.test(requiredFinishedPieces.trim()) ||
    BigInt(requiredFinishedPieces.trim()) <= 0n
  )
    throw new CuttingError(
      "invalid_material",
      "Jumlah produk untuk potong harus bilangan bulat positif, maksimal 15 digit.",
      "requiredFinishedPieces",
    );
  if (!/^\d{1,18}$/.test(paperPricePerSheet.trim()))
    throw new CuttingError(
      "invalid_material",
      "Harga per plano harus Rupiah utuh tidak negatif, maksimal 18 digit.",
      "paperPricePerSheet",
    );
  const yieldCount = BigInt(result[orientation].yield);
  if (yieldCount === 0n)
    throw new CuttingError(
      "zero_yield",
      "Ukuran potongan tidak muat pada plano untuk orientasi ini. Biaya bahan tidak dapat digunakan.",
    );
  const quantity = BigInt(requiredFinishedPieces.trim()),
    price = BigInt(paperPricePerSheet.trim()),
    sheets = (quantity + yieldCount - 1n) / yieldCount,
    total = sheets * price;
  if (total > BigInt(MAX_RUPIAH))
    throw new CuttingError(
      "amount_overflow",
      "Biaya bahan melebihi kapasitas Rupiah 18 digit.",
    );
  return {
    requiredFinishedPieces: quantity.toString(),
    paperPricePerSheet: price.toString(),
    requiredParentSheets: sheets.toString(),
    totalCost: total.toString(),
    extraPieces: (sheets * yieldCount - quantity).toString(),
  };
}
export const gridStride = (count: string) =>
  ((BigInt(count) + 399n) / 400n || 1n).toString();
