import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { createAsset, stopAsset } from "@/features/assets/service";
import { createCash, deleteCash, editCash } from "@/features/cash/service";
import { getReport } from "@/features/reports/service";
import { reportsCsv, reportsXlsx } from "@/features/reports/export";
import ExcelJS from "exceljs";
const url = process.env.TEST_DATABASE_URL;
if (url && url === process.env.DATABASE_URL)
  throw new Error("Database uji harus terpisah.");
if (url) process.env.DATABASE_URL = url;
describe.skipIf(!url)("Aset dan laporan tanpa transaksi kas semu", () => {
  const ids: string[] = [];
  let cashId = "",
    postId = "";
  afterAll(async () => {
    const db = getDb();
    await db.fixedAsset.deleteMany({ where: { id: { in: ids } } });
    if (cashId) await db.cashTransaction.deleteMany({ where: { id: cashId } });
    if (postId) await db.expensePost.deleteMany({ where: { id: postId } });
    await db.$disconnect();
  });
  it("pembelian tidak menjadi beban dua kali; penyusutan tidak mengubah kas, tercakup dalam ekspor dan revisi", async () => {
    const db = getDb();
    const before = await getReport({ mode: "month", month: 11, year: 2022 });
    const post = await db.expensePost.create({
      data: { name: randomUUID(), nameKey: randomUUID(), group: "OPERATIONAL" },
    });
    postId = post.id;
    const cash = (
      await createCash({
        requestKey: randomUUID(),
        data: {
          type: "EXPENSE",
          transactionDate: "2022-11-03",
          description: "Pembelian mesin QA",
          amount: "24000000",
          expensePostId: postId,
        },
      })
    ).row;
    cashId = cash.id;
    const withPurchase = await getReport({
      mode: "month",
      month: 11,
      year: 2022,
    });
    const values = {
      id: randomUUID(),
      name: "Mesin QA",
      acquisitionCost: "24000000",
      startDate: "2022-11-13",
      usefulMonths: 48,
      purchaseCashId: cash.id,
    };
    ids.push(values.id);
    let a = await createAsset(values);
    expect((await createAsset(values)).id).toBe(a.id);
    const after = await getReport({ mode: "month", month: 11, year: 2022 });
    expect(after.finance).toEqual(withPurchase.finance);
    expect(
      BigInt(after.assets.adjustedNet) - BigInt(before.assets.adjustedNet),
    ).toBe(-500000n);
    expect(after.assets.purchases).toBe("24000000");
    expect(after.assets.depreciation).toBe("500000");
    expect(after.revision).not.toBe(withPurchase.revision);
    expect(reportsCsv(after)).toContain("Beban penyusutan nonkas");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Uint8Array.from(await reportsXlsx(after)).buffer);
    expect(book.getWorksheet("Penyusutan")!.getCell("B7").value).toBe(500000);
    await expect(
      deleteCash(cash.id, { updatedAt: cash.updatedAt }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      editCash(cash.id, {
        updatedAt: cash.updatedAt,
        data: {
          type: "EXPENSE",
          transactionDate: "2022-11-03",
          description: "Koreksi",
          amount: "1",
          expensePostId: postId,
        },
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      createAsset({ ...values, id: randomUUID() }),
    ).rejects.toMatchObject({ status: 422 });
    a = await stopAsset(a.id, {
      stopDate: "2022-11-30",
      updatedAt: a.updatedAt,
    });
    expect(
      (await getReport({ mode: "month", month: 12, year: 2022 })).assets
        .depreciation,
    ).toBe("0");
    expect(
      (await getReport({ mode: "month", month: 11, year: 2022 })).assets
        .depreciation,
    ).toBe("500000");
    await expect(
      stopAsset(a.id, { stopDate: "2022-11-01", updatedAt: a.updatedAt }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
