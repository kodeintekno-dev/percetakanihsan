import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { createDatabaseClient } from "@/lib/db-client";
import type { ReportData } from "@/features/reports/schema";
import type { CashRow } from "@/features/cash/schema";
const base = process.env.TEST_BASE_URL,
  email = process.env.TEST_ADMIN_EMAIL,
  password = process.env.TEST_ADMIN_PASSWORD,
  url = process.env.TEST_DATABASE_URL;
if (url && url === process.env.DATABASE_URL)
  throw new Error("TEST_DATABASE_URL harus terpisah.");
describe.skipIf(!base || !email || !password || !url)(
  "HTTP laporan, download nyata dan konsistensi layar",
  () => {
    const db = createDatabaseClient(url!),
      prefix = `http-rpt-${randomUUID().slice(0, 8)}`,
      cashIds: string[] = [],
      postIds: string[] = [];
    let cookie = "",
      root = "",
      sub = "",
      orderId = "",
      paid: CashRow,
      openingLoaded = false,
      original: Awaited<ReturnType<typeof db.cashOpeningSetting.findUnique>>;
    const query = "mode=month&year=2022&month=11";
    const request = (
      path: string,
      method = "GET",
      body?: unknown,
      auth = true,
    ) =>
      fetch(`${base}${path}`, {
        method,
        redirect: "manual",
        headers: {
          Origin: base!,
          "Content-Type": "application/json",
          ...(auth && cookie ? { Cookie: cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    async function report() {
      const r = await request(`/api/reports?${query}`);
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toContain("no-store");
      return (await r.json()) as ReportData;
    }
    async function cash(data: Record<string, unknown>) {
      const r = await request("/api/cash-transactions", "POST", {
        data: { transactionDate: "2022-11-03", description: prefix, ...data },
        requestKey: randomUUID(),
      });
      expect(r.status).toBe(201);
      const { transaction } = (await r.json()) as { transaction: CashRow };
      cashIds.push(transaction.id);
      return transaction;
    }
    beforeAll(async () => {
      const r = await request(
        "/api/auth/login",
        "POST",
        { email, password },
        false,
      );
      expect(r.status).toBe(200);
      cookie = r.headers.get("set-cookie")!.split(";")[0];
      original = await db.cashOpeningSetting.findUnique({ where: { id: 1 } });
      openingLoaded = true;
      expect(
        await db.cashTransaction.count({
          where: {
            transactionDate: {
              gte: new Date("2022-11-01"),
              lte: new Date("2022-12-31"),
            },
          },
        }),
      ).toBe(0);
      await db.cashOpeningSetting.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          openingDate: new Date("2022-11-01"),
          openingAmount: "2000000",
          isConfigured: true,
        },
        update: {
          openingDate: new Date("2022-11-01"),
          openingAmount: "2000000",
          isConfigured: true,
        },
      });
      root = (
        await db.productCategory.create({
          data: { name: prefix, nameKey: prefix },
        })
      ).id;
      sub = (
        await db.productCategory.create({
          data: {
            name: `${prefix}-produk`,
            nameKey: `${prefix}-produk`,
            parentId: root,
          },
        })
      ).id;
      for (const group of ["PRODUCTION", "OPERATIONAL", "MARKETING"] as const)
        postIds.push(
          (
            await db.expensePost.create({
              data: {
                name: `${prefix}-${group}`,
                nameKey: `${prefix}-${group}`,
                group,
              },
            })
          ).id,
        );
    });
    afterAll(async () => {
      await db.cashTransaction.deleteMany({ where: { id: { in: cashIds } } });
      if (orderId) await db.printOrder.deleteMany({ where: { id: orderId } });
      await db.productCategory.deleteMany({
        where: { id: { in: [sub, root].filter(Boolean) } },
      });
      await db.expensePost.deleteMany({ where: { id: { in: postIds } } });
      if (openingLoaded && original)
        await db.cashOpeningSetting.upsert({
          where: { id: 1 },
          create: original,
          update: original,
        });
      else if (openingLoaded)
        await db.cashOpeningSetting.deleteMany({ where: { id: 1 } });
      if (cookie) await request("/api/auth/logout", "POST");
      await db.$disconnect();
    });
    it("sesi wajib pada halaman/API/semua format; query ambigu ditolak", async () => {
      expect((await request("/laporan", "GET", undefined, false)).status).toBe(
        307,
      );
      for (const path of [
        "/api/reports",
        "/api/exports/reports?format=csv",
        "/api/exports/reports?format=xlsx",
      ])
        expect((await request(path, "GET", undefined, false)).status).toBe(401);
      for (const q of [
        "mode=month&year=0&month=11",
        "mode=range&start=2022-11-30&end=2022-11-01",
        "year=2022&year=2023",
        "mode=month&year=2022&month=11&start=2022-11-01",
      ])
        expect((await request(`/api/reports?${q}`)).status).toBe(422);
      for (const q of [
        "format=pdf",
        "format=csv&format=xlsx",
        "format=csv&revision=invalid",
      ])
        expect((await request(`/api/exports/reports?${q}`)).status).toBe(422);
    });
    it("buat order dan kas lewat server; filter bulan/range serta XLSX/CSV identik", async () => {
      const o = await request("/api/orders", "POST", {
        orderDate: "2022-11-03",
        customerName: prefix,
        categoryId: root,
        subcategoryId: sub,
        quantity: "100",
        unit: "pcs",
        unitPrice: "12000",
        status: "NEW",
      });
      expect(o.status).toBe(201);
      orderId = (await o.json()).order.id;
      expect((await report()).finance.income).toBe("0");
      await cash({
        type: "INCOME",
        incomeKind: "SALE",
        categoryId: root,
        subcategoryId: sub,
        orderId,
        amount: "480000",
        soldQuantity: "0",
        soldUnit: "pcs",
      });
      paid = await cash({
        type: "INCOME",
        incomeKind: "SALE",
        categoryId: root,
        subcategoryId: sub,
        orderId,
        amount: "720000",
        soldQuantity: "100",
        soldUnit: "pcs",
      });
      await cash({ type: "INCOME", incomeKind: "OTHER", amount: "100000" });
      for (const [i, amount] of ["400000", "200000", "100000"].entries())
        await cash({ type: "EXPENSE", expensePostId: postIds[i], amount });
      const d = await report();
      expect(d.finance).toMatchObject({
        income: "1300000",
        expense: "700000",
        net: "600000",
        openingBalance: "2000000",
        closingBalance: "2600000",
      });
      expect(d.income.sales[0]).toMatchObject({
        transactionCount: 2,
        linkedOrderCount: 1,
        quantities: [{ unit: "pcs", quantity: "100.000" }],
      });
      const range = (await (
        await request("/api/reports?mode=range&start=2022-11-01&end=2022-11-30")
      ).json()) as ReportData;
      expect(range.finance).toEqual(d.finance);
      expect(range.income).toEqual(d.income);
      const csv = await request(
        `/api/exports/reports?${query}&format=csv&revision=${d.revision}`,
      );
      expect(csv.status).toBe(200);
      expect(csv.headers.get("content-disposition")).toContain(
        "laporan-2022-11-01_2022-11-30.csv",
      );
      expect(csv.headers.get("x-report-revision")).toBe(d.revision);
      const rows = parse(await csv.text(), {
        bom: true,
        columns: true,
      }) as Record<string, string>[];
      expect(
        rows.find(
          (r) => r.bagian === "ringkasan" && r.subbagian === "kas_masuk",
        )!.nominal,
      ).toBe("1300000");
      expect(new Set(rows.map((r) => r.bagian)).size).toBe(7);
      const x = await request(
        `/api/exports/reports?${query}&format=xlsx&revision=${d.revision}`,
      );
      expect(x.status).toBe(200);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(await x.arrayBuffer());
      expect(book.worksheets.map((s) => s.name)).toEqual([
        "Ringkasan",
        "Pendapatan",
        "Pengeluaran",
        "Arus Kas",
        "Analitik Pos",
        "Penyusutan",
        "Piutang",
        "Hutang",
        "Pembayaran Tagihan",
      ]);
      expect(book.getWorksheet("Arus Kas")!.getCell("G8").value).toBe(2600000);
    });
    it("edit/hapus langsung mengubah laporan dan ekspor revisi lama meminta muat ulang", async () => {
      const before = await report();
      const changed = await request(
        `/api/cash-transactions/${paid.id}`,
        "PATCH",
        {
          data: {
            transactionDate: paid.transactionDate,
            type: "INCOME",
            incomeKind: "SALE",
            description: prefix,
            amount: "700000",
            categoryId: root,
            subcategoryId: sub,
            orderId,
            soldQuantity: "100",
            soldUnit: "pcs",
          },
          updatedAt: paid.updatedAt,
        },
      );
      expect(changed.status).toBe(200);
      const row = (await changed.json()).transaction as CashRow;
      const after = await report();
      expect(after.finance.income).toBe("1280000");
      expect(after.revision).not.toBe(before.revision);
      const stale = await request(
        `/api/exports/reports?${query}&format=csv&revision=${before.revision}`,
      );
      expect(stale.status).toBe(409);
      expect((await stale.json()).error).toContain("Muat ulang");
      expect(
        (
          await request(`/api/cash-transactions/${row.id}`, "DELETE", {
            updatedAt: row.updatedAt,
          })
        ).status,
      ).toBe(200);
      const deleted = await report();
      expect(deleted.finance.income).toBe("580000");
      expect(deleted.finance.closingBalance).toBe("1880000");
    });
    it("periode kosong membawa saldo, valid diekspor, logout mencabut akses", async () => {
      const q = "mode=month&year=2022&month=12",
        d = (await (await request(`/api/reports?${q}`)).json()) as ReportData;
      expect(d.finance).toMatchObject({
        income: "0",
        expense: "0",
        net: "0",
        openingBalance: "1880000",
        closingBalance: "1880000",
      });
      expect(d.posts).toEqual([]);
      const x = await request(`/api/exports/reports?${q}&format=xlsx`);
      expect(x.status).toBe(200);
      const b = new ExcelJS.Workbook();
      await b.xlsx.load(await x.arrayBuffer());
      expect(b.getWorksheet("Arus Kas")!.getCell("G8").value).toBe(1880000);
      expect((await request("/api/auth/logout", "POST")).status).toBe(200);
      expect((await request(`/api/reports?${query}`)).status).toBe(401);
      expect(
        (await request(`/api/exports/reports?${query}&format=csv`)).status,
      ).toBe(401);
    });
  },
);
