import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { getReport } from "@/features/reports/service";
import { buildStatement } from "@/features/reports/statements";
import { statementCsv, statementXlsx } from "@/features/reports/statement-export";

const url = process.env.TEST_DATABASE_URL;
if (url && url === process.env.DATABASE_URL) throw new Error("Database pengujian harus terpisah.");
if (url) process.env.DATABASE_URL = url;
const prefix = `statements-${randomUUID()}`;
const filters = { mode: "month" as const, year: 2077, month: 3 };
const equityLabel = "Ekuitas (total aset dikurangi total hutang)";
const businessTables = ["AdminUser", "Session", "LoginThrottle", "SeedRun", "ProductCategory", "ExpensePost", "PrintOrder", "CashTransaction", "FixedAsset", "TradeInvoice", "TradePayment", "CashOpeningSetting", "BudgetEstimate", "BudgetCostItem", "PaperCutSimulation"];
const value = (report: ReturnType<typeof buildStatement>, label: string) => report.rows.find(row => row.label === label)?.amount;

describe.skipIf(!url)("Laporan otomatis hanya membaca data yang sudah ada", () => {
  const db = getDb();
  let original: Awaited<ReturnType<typeof db.cashOpeningSetting.findUnique>>;
  async function fingerprint(includeArchive = false) {
    const rows = [];
    for (const name of [...businessTables, ...(includeArchive ? ["FinancialReportPreparation"] : [])]) {
      rows.push([name, await db.$queryRaw(Prisma.sql`SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) AS rows FROM ${Prisma.raw(`"${name}"`)} t`)]);
    }
    return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  }
  beforeAll(async () => {
    original = await db.cashOpeningSetting.findUnique({ where: { id: 1 } });
    await db.cashOpeningSetting.upsert({ where: { id: 1 }, create: { id: 1, openingDate: new Date("2077-03-01"), openingAmount: "5000000", isConfigured: true }, update: { openingDate: new Date("2077-03-01"), openingAmount: "5000000", isConfigured: true } });
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
    // Fixture cleanup is confined to TEST_DATABASE_URL, never the application database.
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
  it("saldo pembukaan, transaksi, tagihan dan aset otomatis menghasilkan neraca tanpa mutasi", async () => {
    const before = await fingerprint(), data = await getReport(filters), report = buildStatement(data, "neraca");
    expect(data.finance.closingBalance).toBe("5000200");
    expect(data.assets.rows.some(row => row.name === `${prefix}-future`)).toBe(false);
    expect(data.assets.rows.some(row => row.name === `${prefix}-active` && row.bookValue === "1100")).toBe(true);
    expect(value(report, "TOTAL ASET")).toBe("5001500");
    expect(value(report, "Total hutang")).toBe("50");
    expect(value(report, equityLabel)).toBe("5001450");
    expect(value(report, "TOTAL HUTANG DAN EKUITAS")).toBe("5001500");
    expect(report.status).toBe("ready");
    for (const kind of ["neraca", "laba-rugi", "arus-kas"] as const) {
      const statement = buildStatement(data, kind);
      expect(statementCsv(statement)).toContain(statement.title);
      expect(statementCsv(statement)).not.toContain("Belum tersedia");
      expect((await statementXlsx(statement)).length).toBeGreaterThan(1000);
    }
    expect(await fingerprint()).toBe(before);
  });
  it("pelengkap manual lama diabaikan tanpa diubah/dihapus, termasuk fingerprint laporan", async () => {
    const before = await getReport(filters);
    await db.financialReportPreparation.create({ data: { startDate: new Date("2077-03-01"), endDate: new Date("2077-03-31"), version: 1, values: { capital: "999999999999999999", retainedEarnings: "-999999999999999999" }, createdBy: prefix } });
    const archiveBefore = await fingerprint(true), after = await getReport(filters);
    expect(after.revision).toBe(before.revision);
    expect(after).not.toHaveProperty("preparation");
    expect(buildStatement(after, "neraca")).toEqual(buildStatement(before, "neraca"));
    expect(statementCsv(buildStatement(after, "neraca"))).not.toContain("999999999999999999");
    expect(await fingerprint(true)).toBe(archiveBefore);
  });
  it("neraca memakai posisi akhir yang sama meskipun tanggal mulai periode berubah", async () => {
    const monthly = await getReport(filters);
    const range = await getReport({ mode: "range", start: "2077-03-15", end: "2077-03-31" });
    expect(range.finance.closingBalance).toBe(monthly.finance.closingBalance);
    expect(buildStatement(range, "neraca").rows).toEqual(buildStatement(monthly, "neraca").rows);
    expect(value(buildStatement(range, "laba-rugi"), "LABA / RUGI PERIODE BERJALAN")).toBe("-100");
    expect(value(buildStatement(monthly, "laba-rugi"), "LABA / RUGI PERIODE BERJALAN")).toBe("100");
  });
  it("transaksi baru memperbarui ekuitas otomatis tanpa perlu menyimpan konfirmasi", async () => {
    const before = await getReport(filters);
    const archive = await db.financialReportPreparation.findMany({ where: { createdBy: prefix } });
    await db.cashTransaction.create({ data: { type: "INCOME", incomeKind: "OTHER", amount: "50", description: prefix, transactionDate: new Date("2077-03-10") } });
    const changed = await getReport(filters), report = buildStatement(changed, "neraca");
    expect(changed.revision).not.toBe(before.revision);
    expect(value(report, equityLabel)).toBe("5001500");
    expect(report.status).toBe("ready");
    expect(await db.financialReportPreparation.findMany({ where: { createdBy: prefix } })).toEqual(archive);
  });
  it("aset yang sudah dibayar tetap masuk neraca meskipun baru digunakan bulan berikutnya", async () => {
    const before = await getReport(filters);
    const post = await db.expensePost.findFirstOrThrow({ where: { nameKey: prefix } });
    const purchase = await db.cashTransaction.create({ data: { type: "EXPENSE", expensePostId: post.id, expenseGroupSnapshot: "OPERATIONAL", amount: "800", description: prefix, transactionDate: new Date("2077-03-05") } });
    await db.fixedAsset.create({ data: { name: `${prefix}-paid-before-use`, acquisitionCost: "800", startDate: new Date("2077-04-01"), usefulMonths: 12, purchaseCashId: purchase.id } });
    const after = await getReport(filters);
    expect(after.assets.rows.find(row => row.name === `${prefix}-paid-before-use`)).toMatchObject({ bookValue: "800", accumulated: "0", amount: "0" });
    expect(after.finance.closingBalance).toBe("4999450");
    expect(value(buildStatement(after, "neraca"), equityLabel)).toBe(value(buildStatement(before, "neraca"), equityLabel));
    expect(value(buildStatement(after, "laba-rugi"), "LABA / RUGI PERIODE BERJALAN")).toBe(value(buildStatement(before, "laba-rugi"), "LABA / RUGI PERIODE BERJALAN"));
    expect(value(buildStatement(after, "arus-kas"), "Kas bersih investasi tertaut")).toBe("-800");
  });
  it("neraca per akhir bulan tetap tersedia bila awal rentang mendahului pembukaan kas", async () => {
    const monthly = await getReport(filters);
    const earlier = await getReport({ mode: "range", start: "2077-02-01", end: "2077-03-31" });
    expect(earlier.finance.closingBalance).toBeNull();
    expect(earlier.balanceCash).toBe(monthly.balanceCash);
    expect(buildStatement(earlier, "neraca").rows).toEqual(buildStatement(monthly, "neraca").rows);
    expect(buildStatement(earlier, "neraca").status).toBe("ready");
  });
});
