import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { createDatabaseClient } from "@/lib/db-client";
import { todayJakarta } from "@/lib/date";
import type { CashRow } from "@/features/cash/schema";
const base = process.env.TEST_BASE_URL,
  email = process.env.TEST_ADMIN_EMAIL,
  password = process.env.TEST_ADMIN_PASSWORD,
  url = process.env.TEST_DATABASE_URL;
if (url && url === process.env.DATABASE_URL)
  throw new Error("TEST_DATABASE_URL harus terpisah.");
describe.skipIf(!base || !email || !password || !url)(
  "HTTP KAS, dashboard dan ekspor aktual",
  () => {
    const db = createDatabaseClient(url!),
      prefix = `http-kas-${randomUUID().slice(0, 8)}`,
      cashIds: string[] = [],
      orderIds: string[] = [];
    let cookie = "",
      categoryId = "",
      postId = "",
      openingLoaded = false,
      original: Awaited<ReturnType<typeof db.cashOpeningSetting.findUnique>>;
    const request = (
      path: string,
      method = "GET",
      body?: unknown,
      auth = true,
      origin = base!,
    ) =>
      fetch(`${base}${path}`, {
        method,
        redirect: "manual",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          ...(auth && cookie ? { Cookie: cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const values = (extra: Record<string, unknown> = {}) => ({
      transactionDate: todayJakarta(),
      type: "INCOME",
      incomeKind: "OTHER",
      description: prefix,
      amount: "100000",
      ...extra,
    });
    async function create(data: unknown = values(), key = randomUUID()) {
      const response = await request("/api/cash-transactions", "POST", {
        data,
        requestKey: key,
      });
      expect(response.status).toBe(201);
      const { transaction } = (await response.json()) as {
        transaction: CashRow;
      };
      cashIds.push(transaction.id);
      return transaction;
    }
    beforeAll(async () => {
      const login = await request(
        "/api/auth/login",
        "POST",
        { email, password },
        false,
      );
      expect(login.status).toBe(200);
      cookie = login.headers.get("set-cookie")!.split(";")[0];
      original = await db.cashOpeningSetting.findUnique({ where: { id: 1 } });
      openingLoaded = true;
      const current = await (await request("/api/cash-opening")).json();
      expect(
        (
          await request("/api/cash-opening", "PUT", {
            openingDate: "2000-01-01",
            openingAmount: "2000000",
            updatedAt: current.opening?.updatedAt ?? null,
            acknowledge: true,
          })
        ).status,
      ).toBe(200);
      categoryId = (
        await db.productCategory.create({
          data: { name: prefix, nameKey: prefix },
        })
      ).id;
      postId = (
        await db.expensePost.create({
          data: { name: prefix, nameKey: prefix, group: "PRODUCTION" },
        })
      ).id;
    });
    afterAll(async () => {
      await db.cashTransaction.deleteMany({ where: { id: { in: cashIds } } });
      await db.printOrder.deleteMany({ where: { id: { in: orderIds } } });
      if (categoryId)
        await db.productCategory.deleteMany({ where: { id: categoryId } });
      if (postId) await db.expensePost.deleteMany({ where: { id: postId } });
      if (openingLoaded && original)
        await db.cashOpeningSetting.upsert({
          where: { id: 1 },
          create: original,
          update: original,
        });
      else if (openingLoaded)
        await db.cashOpeningSetting.deleteMany({ where: { id: 1 } });
      await request("/api/auth/logout", "POST");
      await db.$disconnect();
    });
    it("SEC: halaman dan semua endpoint kas/setting/agregasi/ekspor menolak sesi hilang, origin asing dan input tidak valid", async () => {
      for (const path of [
        "/buku-kas",
        "/buku-kas/baru",
        "/buku-kas/foreign/edit",
        "/pengaturan",
        "/dashboard",
      ])
        expect((await request(path, "GET", undefined, false)).status).toBe(307);
      for (const [path, method] of [
        ["/api/cash-transactions", "GET"],
        ["/api/cash-transactions", "POST"],
        ["/api/cash-transactions/foreign", "GET"],
        ["/api/cash-transactions/foreign", "PATCH"],
        ["/api/cash-transactions/foreign", "DELETE"],
        ["/api/cash-opening", "GET"],
        ["/api/cash-opening", "PUT"],
        ["/api/dashboard", "GET"],
        ["/api/finance/summary?start=2026-11-01&end=2026-11-30", "GET"],
        ["/api/exports/cash?format=csv", "GET"],
        ["/api/exports/cash?format=xlsx", "GET"],
        ["/api/orders/foreign/allocation", "GET"],
      ])
        expect(
          (
            await request(
              path,
              method,
              method === "GET" ? undefined : {},
              false,
            )
          ).status,
        ).toBe(401);
      expect(
        (
          await request(
            "/api/cash-transactions",
            "POST",
            { data: values(), requestKey: randomUUID() },
            true,
            "https://evil.test",
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await request(
            "/api/cash-opening",
            "PUT",
            {},
            true,
            "https://evil.test",
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await request("/api/cash-transactions", "POST", {
            data: values({ amount: "0" }),
            requestKey: randomUUID(),
          })
        ).status,
      ).toBe(422);
      expect(
        (await request("/api/finance/summary?start=2026-11-30&end=2026-11-01"))
          .status,
      ).toBe(422);
    });
    it("KAS-04/06/07: pesanan tidak menciptakan kas, dashboard berubah pada create/edit/delete; kirim ulang satu transaksi", async () => {
      const before = await (await request("/api/dashboard")).json();
      const orderResponse = await request("/api/orders", "POST", {
        orderDate: todayJakarta(),
        customerName: prefix,
        categoryId,
        subcategoryId: null,
        quantity: "100",
        unit: "pcs",
        unitPrice: "50000",
        status: "IN_PROGRESS",
      });
      expect(orderResponse.status).toBe(201);
      const { order } = await orderResponse.json();
      orderIds.push(order.id);
      let dashboard = await (await request("/api/dashboard")).json();
      expect(dashboard.finance.income).toBe(before.finance.income);
      expect(dashboard.finance.expense).toBe(before.finance.expense);
      expect(dashboard.orderCount).toBe(before.orderCount + 1);
      expect(dashboard.processingCount).toBe(before.processingCount + 1);
      const data = values({
          incomeKind: "SALE",
          categoryId,
          orderId: order.id,
          soldQuantity: "100",
          soldUnit: "pcs",
        }),
        key = randomUUID();
      let row = await create(data, key);
      const replay = await request("/api/cash-transactions", "POST", {
        data,
        requestKey: key,
      });
      expect(replay.status).toBe(200);
      expect((await replay.json()).transaction.id).toBe(row.id);
      expect(
        (await (await request(`/api/orders/${order.id}/allocation`)).json())
          .remainingQuantity,
      ).toBe("0.000");
      expect(
        (
          await request("/api/cash-transactions", "POST", {
            data,
            requestKey: randomUUID(),
          })
        ).status,
      ).toBe(422);
      dashboard = await (await request("/api/dashboard")).json();
      expect(
        BigInt(dashboard.finance.income) - BigInt(before.finance.income),
      ).toBe(100000n);
      const edit = await request(`/api/cash-transactions/${row.id}`, "PATCH", {
        data: { ...data, amount: "1300000" },
        updatedAt: row.updatedAt,
      });
      expect(edit.status).toBe(200);
      const stale = row;
      row = (await edit.json()).transaction;
      expect(
        (
          await request(`/api/cash-transactions/${row.id}`, "DELETE", {
            updatedAt: stale.updatedAt,
          })
        ).status,
      ).toBe(409);
      dashboard = await (await request("/api/dashboard")).json();
      expect(
        BigInt(dashboard.finance.income) - BigInt(before.finance.income),
      ).toBe(1300000n);
      expect(
        (
          await request(`/api/cash-transactions/${row.id}`, "DELETE", {
            updatedAt: row.updatedAt,
          })
        ).status,
      ).toBe(200);
      expect((await request(`/api/cash-transactions/${row.id}`)).status).toBe(
        404,
      );
      dashboard = await (await request("/api/dashboard")).json();
      expect(dashboard.finance.income).toBe(before.finance.income);
    });
    it("KAS-03/08: gabungan filter, pagination, kedua unduhan server 12 baris dan formula tetap teks", async () => {
      const dangerous = `=SUM(1,2) ${prefix} é,\n100%_`;
      for (let i = 0; i < 12; i++)
        await create({
          transactionDate: todayJakarta(),
          type: "EXPENSE",
          expensePostId: postId,
          description: dangerous,
          amount: "400000",
        });
      await create(values({ description: dangerous }));
      const query = new URLSearchParams({
        q: prefix,
        type: "EXPENSE",
        expensePostId: postId,
        start: todayJakarta(),
        end: todayJakarta(),
        page: "2",
        pageSize: "10",
      });
      const list = await (
        await request(`/api/cash-transactions?${query}`)
      ).json();
      expect(list.total).toBe(12);
      expect(list.rows).toHaveLength(2);
      expect(list.totals.expense).toBe("4800000");
      const csvResponse = await request(
        `/api/exports/cash?${query}&format=csv`,
      );
      expect(csvResponse.status).toBe(200);
      expect(csvResponse.headers.get("x-export-row-count")).toBe("12");
      const csvBytes = new Uint8Array(await csvResponse.arrayBuffer());
      expect(Array.from(csvBytes.slice(0, 3))).toEqual([239, 187, 191]);
      const rows = parse(csvBytes, { bom: true, columns: true }) as Record<
        string,
        string
      >[];
      expect(rows).toHaveLength(12);
      expect(rows[0].Keterangan).toBe(`'${dangerous}`);
      const xlsx = await request(`/api/exports/cash?${query}&format=xlsx`);
      expect(xlsx.status).toBe(200);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(await xlsx.arrayBuffer());
      expect(book.getWorksheet("Buku Kas")!.rowCount).toBe(13);
      expect(book.getWorksheet("Buku Kas")!.getCell("D2").value).toBe(
        dangerous,
      );
      expect(book.getWorksheet("Buku Kas")!.getCell("E2").value).toBe(400000);
      expect(
        (await request(`/api/exports/cash?${query}&format=pdf`)).status,
      ).toBe(422);
    });
    it("pembukaan melalui HTTP memerlukan konfirmasi; tidak menambah pemasukan; agregasi bukan harga pesanan", async () => {
      const before = await (await request("/api/dashboard")).json(),
        state = await (await request("/api/cash-opening")).json();
      const body = {
        openingDate: "2000-01-01",
        openingAmount: "3000000",
        updatedAt: state.opening.updatedAt,
      };
      expect((await request("/api/cash-opening", "PUT", body)).status).toBe(
        422,
      );
      expect(
        (
          await request("/api/cash-opening", "PUT", {
            ...body,
            acknowledge: true,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await request("/api/cash-opening", "PUT", {
            ...body,
            acknowledge: true,
          })
        ).status,
      ).toBe(409);
      const after = await (await request("/api/dashboard")).json();
      expect(after.finance.income).toBe(before.finance.income);
      expect(after.finance.expense).toBe(before.finance.expense);
      expect(
        BigInt(after.finance.closingBalance) -
          BigInt(before.finance.closingBalance),
      ).toBe(1000000n);
      const summary = await request(
        `/api/finance/summary?start=${after.period.start}&end=${after.period.end}`,
      );
      expect(summary.status).toBe(200);
      expect((await summary.json()).net).toBe(after.finance.net);
      expect(summary.headers.get("cache-control")).toContain("no-store");
    });
  },
);
