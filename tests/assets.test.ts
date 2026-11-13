import { describe, expect, it } from "vitest";
import { assetDepreciation } from "@/features/assets/depreciation";
import { assetSchema, type AssetRow } from "@/features/assets/schema";
const asset: AssetRow = {
  id: "a",
  name: "Mesin",
  acquisitionCost: "24000000",
  startDate: "2026-11-13",
  usefulMonths: 48,
  stopDate: null,
  purchaseCashId: null,
  updatedAt: "2026-11-13T00:00:00Z",
};
describe("Penyusutan garis lurus nonkas", () => {
  it("mengakui satu bulan penuh hanya pada akhir bulan sejak siap digunakan", () => {
    expect(assetDepreciation(asset, "2026-11-01", "2026-11-29").amount).toBe(
      "0",
    );
    expect(assetDepreciation(asset, "2026-11-13", "2026-11-30")).toEqual({
      amount: "500000",
      accumulated: "500000",
      bookValue: "23500000",
    });
    expect(assetDepreciation(asset, "2026-10-01", "2026-10-31").amount).toBe(
      "0",
    );
  });
  it("total pembulatan tepat sebesar harga perolehan dan tidak melampaui masa pakai", () => {
    const a = {
      ...asset,
      acquisitionCost: "100",
      usefulMonths: 3,
      startDate: "2024-01-01",
    };
    expect(assetDepreciation(a, "2024-01-01", "2024-01-31").amount).toBe("33");
    expect(assetDepreciation(a, "2024-02-01", "2024-02-29").amount).toBe("34");
    expect(assetDepreciation(a, "2024-03-01", "2024-03-31").amount).toBe("33");
    expect(assetDepreciation(a, "2024-04-01", "2026-12-31")).toEqual({
      amount: "0",
      accumulated: "100",
      bookValue: "0",
    });
    expect(assetDepreciation(a, "2024-01-01", "2024-03-31").amount).toBe("100");
  });
  it("penghentian mempertahankan penyusutan historis dan menghitung bulan penghentian", () => {
    const a = { ...asset, stopDate: "2026-12-15" };
    expect(assetDepreciation(a, "2026-11-01", "2027-12-31")).toEqual({
      amount: "1000000",
      accumulated: "1000000",
      bookValue: "23000000",
    });
    expect(assetDepreciation(a, "2027-01-01", "2027-01-31").amount).toBe("0");
  });
  it("masa pakai dan harga harus valid", () => {
    const values = {
      id: crypto.randomUUID(),
      name: "Mesin",
      acquisitionCost: "100",
      startDate: "2026-11-13",
      usefulMonths: 48,
    };
    for (const extra of [
      { acquisitionCost: "0" },
      { usefulMonths: 0 },
      { usefulMonths: 1201 },
      { startDate: "2026-02-30" },
    ])
      expect(assetSchema.safeParse({ ...values, ...extra }).success).toBe(
        false,
      );
  });
});
