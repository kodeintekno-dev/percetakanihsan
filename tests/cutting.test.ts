import { describe, it, expect } from "vitest";
import vectors from "../docs/fixtures/potong-kertas.json";
import {
  calculateCutting,
  calculateMaterial,
  gridStride,
  type CutDimensions,
} from "@/lib/calculations/cutting";
import { ExactDecimal } from "@/lib/money";
describe("CUT-01..07: fixture asli, dua FLOOR tanpa orientasi campuran", () => {
  it.each(vectors.cases)("$id", ({ input, expected }) => {
    const result = calculateCutting(input);
    for (const name of ["original", "rotated"] as const) {
      const actual = result[name],
        want = expected[name];
      expect(actual.columns).toBe(String(want.columns));
      expect(actual.rows).toBe(String(want.rows));
      expect(actual.yield).toBe(String(want.yield));
      for (const key of [
        "remainingLengthCm",
        "remainingWidthCm",
        "wasteAreaCm2",
      ] as const)
        expect(new ExactDecimal(actual[key]).eq(want[key])).toBe(true);
      expect(actual.wastePercentRounded2).toBe(want.wastePercentRounded2);
    }
    expect(result.bestOrientation).toBe(expected.bestOrientation);
  });
  it.each(vectors.invalidCases)("invalid $id", ({ input }) => {
    expect(() => calculateCutting(input)).toThrow();
  });
  it.each([
    "",
    "NaN",
    "Infinity",
    "1e2",
    "-0.1",
    "0",
    "1.001",
    "10000000000",
    Number.NaN,
    Infinity,
  ])("menolak dimensi %s", (value) => {
    expect(() =>
      calculateCutting({
        ...vectors.cases[0].input,
        sheetLengthCm: value,
      } as CutDimensions),
    ).toThrow();
  });
  it("koma didukung, pembagian 0,3/0,1 tepat dan luas grid/waste konsisten", () => {
    const r = calculateCutting({
      sheetLengthCm: "0,3",
      sheetWidthCm: "0,2",
      cutLengthCm: "0,1",
      cutWidthCm: "0,1",
    });
    expect(r.original.yield).toBe("6");
    expect(r.original.wasteAreaCm2).toBe("0");
    expect(r.tied).toBe(true);
    expect(r.bestOrientation).toBe("original");
    for (const c of vectors.cases) {
      const a = calculateCutting(c.input);
      for (const grid of [a.original, a.rotated]) {
        expect(
          new ExactDecimal(grid.usedAreaCm2)
            .add(grid.wasteAreaCm2)
            .eq(a.sheetAreaCm2),
        ).toBe(true);
        expect(
          new ExactDecimal(grid.columns)
            .mul(grid.pieceLengthCm)
            .add(grid.remainingLengthCm)
            .eq(a.input.sheetLengthCm),
        ).toBe(true);
        expect(
          new ExactDecimal(grid.rows)
            .mul(grid.pieceWidthCm)
            .add(grid.remainingWidthCm)
            .eq(a.input.sheetWidthCm),
        ).toBe(true);
      }
    }
  });
  it("CUT-07 ceil 100/15=7, Rp70.000, kelebihan5; ASLI9 plano; nol yield diblokir", () => {
    const r = calculateCutting(vectors.cases[0].input);
    expect(calculateMaterial(r, "rotated", "100", "10000")).toMatchObject({
      requiredParentSheets: "7",
      totalCost: "70000",
      extraPieces: "5",
    });
    expect(calculateMaterial(r, "original", "100", "10000")).toMatchObject({
      requiredParentSheets: "9",
      totalCost: "90000",
      extraPieces: "8",
    });
    expect(() =>
      calculateMaterial(
        calculateCutting(vectors.cases[2].input),
        "original",
        "100",
        "1",
      ),
    ).toThrow(/tidak muat/);
    for (const qty of ["0", "-1", "1.5", "NaN"])
      expect(() => calculateMaterial(r, "rotated", qty, "1")).toThrow();
    expect(() =>
      calculateMaterial(r, "rotated", "100", "999999999999999999"),
    ).toThrow(/18 digit/);
  });
  it("yield jauh di atas Int/Number tetap tepat; rencana render dibatasi garis tanpa membatasi matematika", () => {
    const r = calculateCutting({
      sheetLengthCm: "9999999999.99",
      sheetWidthCm: "9999999999.99",
      cutLengthCm: "0.01",
      cutWidthCm: "0.01",
    });
    expect(r.original.columns).toBe("999999999999");
    expect(r.original.yield).toBe("999999999998000000000001");
    expect(r.original.wasteAreaCm2).toBe("0");
    expect(
      BigInt(r.original.columns) / BigInt(gridStride(r.original.columns)),
    ).toBeLessThanOrEqual(400n);
  });
});
