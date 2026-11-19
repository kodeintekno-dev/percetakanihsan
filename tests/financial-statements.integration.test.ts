import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { getReport } from "@/features/reports/service";
import { readPreparation, savePreparation } from "@/features/reports/preparation-service";
import { buildStatement, preparationSchema } from "@/features/reports/statements";
import { statementCsv, statementXlsx } from "@/features/reports/statement-export";

const url = process.env.TEST_DATABASE_URL;
if (url && url === process.env.DATABASE_URL) throw new Error("Database pengujian harus terpisah.");
if (url) process.env.DATABASE_URL = url;
const prefix = `statements-${randomUUID()}`;
const filters = { mode: "month" as const, year: 2077, month: 3 };
const businessTables = ["AdminUser", "Session", "LoginThrottle", "SeedRun", "ProductCategory", "ExpensePost", "PrintOrder", "CashTransaction", "FixedAsset", "TradeInvoice", "TradePayment", "CashOpeningSetting", "BudgetEstimate", "BudgetCostItem", "PaperCutSimulation"];

describe.skipIf(!url)("Laporan hanya membaca transaksi; pelengkap menambah versi pada tabel baru", () => {
  const db = getDb();
  let original: Awaited<ReturnType<typeof db.cashOpeningSetting.findUnique>>;
  async function businessFingerprint() {
    const records = [];
    for (const name of businessTables) {
      const result = await db.$queryRaw(Prisma.sql`SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) AS rows FROM ${Prisma.raw(`"${name}"`)} t`);
      records.push([name, result]);
    }
    return createHash("sha256").update(JSON.stringify(records)).digest("hex");
  }
  beforeAll(async () => {
    original = await db.cashOpeningSetting.findUnique({ where: { id: 1 } });
    await db.cashOpeningSetting.upsert({ where: { id: 1 }, create: { id: 1, openingDate: new Date("2077-03-01"), openingAmount: "1000", isConfigured: true }, update: { openingDate: new Date("2077-03-01"), openingAmount: "1000", isConfigured: true } });
    const post = await db.expensePost.create({ data: { name: prefix, nameKey: prefix, group: "OPERATIONAL" } });
    const category = await db.productCategory.create({ data: { name: prefix, nameKey: prefix } });
    const order = await db.printOrder.create({ data: { orderNumber: prefix, orderDate: new Date("2077-03-02"), customerName: prefix, categoryId: category.id, categoryNameSnapshot: "Cetak QA", productNameSnapshot: "Cetak QA", quantity: "1", unit: "pcs", unitPrice: "200", totalPrice: "200", status: "PICKED_UP" } });
    await db.cashTransaction.createMany({ data: [
      { type: "INCOME", incomeKind: "OTHER", amount: "500", description: prefix, transactionDate: new Date("2077-03-02") },
      { type: "EXPENSE", expensePostId: post.id, expenseGroupSnapshot: "OPERATIONAL", amount: "300", description: prefix, transactionDate: new Date("2077-03-03") },
    ] });
    await db.fixedAsset.createMany({ data: [
      { name: `${prefix}-active`, acquisitionCost: "1200", startDate: new Date("2077-03-01"), usefulMonths: 12 },
      { name: `${prefix}-future`, acquisitionCost: "9999", startDate: new Date("2078-01-01"), usefulMonths: 12 },
    ] });
    await db.tradeInvoice.createMany({ data: [
      { id: `${prefix}-receivable`, requestHash: prefix, kind: "RECEIVABLE", reference: `${prefix}-R`, referenceKey: `${prefix}-r`, partyName: "Pelanggan QA", orderId: order.id, categoryId: category.id, issueDate: new Date("2077-03-02"), dueDate: new Date("2077-04-01"), amount: "200" },
      { id: `${prefix}-payable`, requestHash: prefix, kind: "PAYABLE", reference: `${prefix}-P`, referenceKey: `${prefix}-p`, partyName: "Pemasok QA", expensePostId: post.id, expenseGroupSnapshot: "OPERATIONAL", issueDate: new Date("2077-03-02"), dueDate: new Date("2077-04-01"), amount: "50" },
    ] });
  });
  afterAll(async () => {
    // Only this explicitly isolated test database is touched by fixture cleanup.
    await db.tradeInvoice.deleteMany({ where: { requestHash: prefix } });
    await db.fixedAsset.deleteMany({ where: { name: { startsWith: prefix } } });
    await db.cashTransaction.deleteMany({ where: { description: prefix } });
    await db.expensePost.deleteMany({ where: { nameKey: prefix } });
    await db.printOrder.deleteMany({ where: { customerName: prefix } });
    await db.productCategory.deleteMany({ where: { nameKey: prefix } });
    await db.financialReportPreparation.deleteMany({ where: { createdBy: prefix } });
    if (original) await db.cashOpeningSetting.upsert({ where: { id: 1 }, create: original, update: original });
    else await db.cashOpeningSetting.deleteMany({ where: { id: 1 } });
    await db.$disconnect();
  });
  it("readiness mengenali tabel yang belum ada tanpa menggagalkan transaksi baca", async () => {
    await db.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL search_path = pg_catalog`;
      const state = await readPreparation(tx, "2077-03-01", "2077-03-31");
      expect(state.available).toBe(false);
      expect(state.version).toBe(0);
      expect(await tx.$queryRaw`SELECT 1 AS ok`).toEqual([{ ok: 1 }]);
    });
  });
  it("aset masa depan tidak masuk, dan semua pratinjau/ekspor tidak mengubah baris lama", async () => {
    const before = await businessFingerprint();
    const data = await getReport(filters);
    expect(data.assets.rows.some(row => row.name === `${prefix}-future`)).toBe(false);
    expect(data.assets.rows.some(row => row.name === `${prefix}-active` && row.bookValue === "1100")).toBe(true);
    for (const kind of ["neraca", "laba-rugi", "arus-kas"] as const) {
      const report = buildStatement(data, kind);
      expect(statementCsv(report)).toContain(report.title);
      expect((await statementXlsx(report)).length).toBeGreaterThan(1000);
    }
    expect(await businessFingerprint()).toBe(before);
  });
  it("simpan menambah versi, mempertahankan riwayat dan seluruh transaksi lama", async () => {
    const before = await businessFingerprint();
    const firstValues = preparationSchema.parse({ capital: "2000", retainedEarnings: "450", balanceConfirmed: true, classificationConfirmed: true });
    const initial = await getReport(filters), initialVersion = initial.preparation!.version;
    const one = await savePreparation(filters, firstValues, initialVersion, prefix, initial.sourceRevision!);
    const afterOne = await getReport(filters);
    expect(afterOne.revision).not.toBe(initial.revision);
    expect(afterOne.preparation!.values).toEqual(firstValues);
    const nextValues = { ...firstValues, notes: "Versi diperiksa ulang" };
    const two = await savePreparation(filters, nextValues, one.version, prefix, afterOne.sourceRevision!);
    expect(two.version).toBe(one.version + 1);
    const history = await db.financialReportPreparation.findMany({ where: { createdBy: prefix }, orderBy: { version: "asc" } });
    expect(history.map(row => row.values)).toEqual([firstValues, nextValues].map(values => ({ schemaVersion: 1, sourceRevision: initial.sourceRevision, values })));
    await expect(savePreparation(filters, nextValues, one.version, prefix, afterOne.sourceRevision!)).rejects.toMatchObject({ status: 409 });
    expect(await db.financialReportPreparation.count({ where: { createdBy: prefix } })).toBe(2);
    expect(await businessFingerprint()).toBe(before);
  });
  it("perubahan sumber membatalkan konfirmasi pelengkap tanpa menulis ulang riwayat", async () => {
    const before = await getReport(filters);
    expect(before.preparation!.stale).toBe(false);
    const versions = await db.financialReportPreparation.findMany({ where: { createdBy: prefix }, orderBy: { version: "asc" } });
    await db.cashTransaction.create({ data: { type: "INCOME", incomeKind: "OTHER", amount: "50", description: prefix, transactionDate: new Date("2077-03-10") } });
    const changed = await getReport(filters);
    expect(changed.preparation!.stale).toBe(true);
    expect(changed.preparation!.values.balanceConfirmed).toBe(false);
    expect(changed.preparation!.values.classificationConfirmed).toBe(false);
    expect(buildStatement(changed, "neraca").status).toBe("draft");
    expect(await db.financialReportPreparation.findMany({ where: { createdBy: prefix }, orderBy: { version: "asc" } })).toEqual(versions);
  });
});
