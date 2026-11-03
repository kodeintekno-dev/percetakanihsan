import { describe, it, expect } from "vitest";
import { calculateBudget } from "@/lib/calculations/budget";
import { budgetSchema, parseBudgetFilters } from "@/features/budget/schema";
import { formatUnitRupiah } from "@/features/budget/format";
const base = {
  title: "Cetak buku",
  categoryId: "c",
  subcategoryId: null,
  quantity: "100",
  unit: "pcs",
  marginMode: "PERCENT_MARKUP" as const,
  marginValue: "20",
  items: [
    { label: "Kertas", costType: "PAPER", quantity: "1", unitCost: "500000" },
  ],
  paperCut: null,
};
describe("HPP-01..04: hitung ulang baris, HPP dan keuntungan", () => {
  it("tampilan per-unit membulatkan langsung dari total/qty, menghindari dua kali pembulatan", () => {
    expect(formatUnitRupiah("123495", "100000").replace(/\s/g, "")).toBe(
      "Rp1,23",
    );
    expect(formatUnitRupiah("123500", "100000").replace(/\s/g, "")).toBe(
      "Rp1,24",
    );
  });
  it("500rb/100 = 5rb, markup20% = total600rb / unit6rb", () => {
    expect(calculateBudget(base)).toMatchObject({
      totalHpp: "500000",
      hppPerUnit: "5000.0000",
      profitTotal: "100000",
      suggestedSellingTotal: "600000",
      suggestedSellingPerUnit: "6000.0000",
    });
  });
  it("keuntungan nominal100rb, edit/remove komponen, HALF_UP per baris dan persen", () => {
    expect(
      calculateBudget({
        ...base,
        marginMode: "FIXED_AMOUNT",
        marginValue: "100000",
      }).suggestedSellingTotal,
    ).toBe("600000");
    expect(
      calculateBudget({
        ...base,
        items: [
          { quantity: "1.5", unitCost: "1" },
          { quantity: "0.5", unitCost: "1" },
        ],
      }),
    ).toMatchObject({
      lineTotals: ["2", "1"],
      totalHpp: "3",
      profitTotal: "1",
      suggestedSellingTotal: "4",
    });
    expect(
      calculateBudget({
        ...base,
        items: [{ quantity: "2", unitCost: "500000" }],
      }).totalHpp,
    ).toBe("1000000");
    expect(calculateBudget({ ...base, items: [] }).totalHpp).toBe("0");
  });
  it("nol biaya sah, qty0/negatif/overflow/nominal pecahan ditolak; presisi per unit di atas JS aman", () => {
    expect(
      calculateBudget({ ...base, items: [{ quantity: "1", unitCost: "0" }] })
        .suggestedSellingTotal,
    ).toBe("0");
    for (const change of [
      { quantity: "0" },
      { quantity: "-1" },
      { marginValue: "-1" },
      { marginMode: "FIXED_AMOUNT" as const, marginValue: "0.5" },
      {
        items: [{ quantity: "1", unitCost: "999999999999999999" }],
        marginValue: "20",
      },
    ])
      expect(() => calculateBudget({ ...base, ...change })).toThrow();
    expect(
      calculateBudget({
        ...base,
        quantity: "0.001",
        items: [{ quantity: "1", unitCost: "999999999999999999" }],
        marginValue: "0",
      }).hppPerUnit,
    ).toBe("999999999999999999000.0000");
  });
  it("server menolak spoof total dan komponen hasil potong tidak konsisten/duplikat", () => {
    expect(budgetSchema.safeParse({ ...base, totalHpp: "1" }).success).toBe(
      false,
    );
    const paper = {
      sheetLengthCm: "107",
      sheetWidthCm: "80",
      cutLengthCm: "26",
      cutWidthCm: "20,5",
      selectedOrientation: "rotated",
      material: { requiredFinishedPieces: "100", paperPricePerSheet: "10000" },
    };
    const item = {
      label: "Bahan potong",
      costType: "PAPER",
      quantity: "7",
      unitCost: "10000",
      fromPaperCut: true,
    };
    expect(
      budgetSchema.safeParse({ ...base, paperCut: paper, items: [item] })
        .success,
    ).toBe(true);
    expect(
      budgetSchema.safeParse({
        ...base,
        paperCut: paper,
        items: [{ ...item, quantity: "8" }],
      }).success,
    ).toBe(false);
    expect(
      budgetSchema.safeParse({ ...base, paperCut: paper, items: [item, item] })
        .success,
    ).toBe(false);
    expect(
      budgetSchema.safeParse({
        ...base,
        paperCut: paper,
        items: [{ ...item, quantity: "" }],
      }).success,
    ).toBe(false);
    expect(
      budgetSchema.safeParse({ ...base, paperCut: null, items: [item] })
        .success,
    ).toBe(false);
    expect(
      budgetSchema.safeParse({ ...base, paperCut: { ...paper, yield: "15" } })
        .success,
    ).toBe(false);
  });
  it("filter tanggal terbalik, sub tanpa parent dan parameter ganda ditolak", () => {
    expect(() =>
      parseBudgetFilters({ start: "2026-11-03", end: "2026-11-01" }),
    ).toThrow();
    expect(() => parseBudgetFilters({ subcategoryId: "c" })).toThrow();
    expect(() =>
      parseBudgetFilters(new URLSearchParams("page=1&page=2")),
    ).toThrow();
  });
});
