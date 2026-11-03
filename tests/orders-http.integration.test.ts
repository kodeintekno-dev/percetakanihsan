import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { createDatabaseClient } from "@/lib/db-client";
import type { OrderRow } from "@/features/orders/schema";
const base = process.env.TEST_BASE_URL,
  email = process.env.TEST_ADMIN_EMAIL,
  password = process.env.TEST_ADMIN_PASSWORD;
const prefix = `http-ord-${randomUUID().slice(0, 8)}`;
describe.skipIf(!base || !email || !password)(
  "HTTP ORD-01..07, SEC dan ekspor file aktual",
  () => {
    let cookie = "",
      parentId = "",
      subId = "";
    const ids: string[] = [];
    const db = process.env.TEST_DATABASE_URL
      ? createDatabaseClient(process.env.TEST_DATABASE_URL)
      : null;
    const request = (
      path: string,
      method = "GET",
      body?: unknown,
      authenticated = true,
      source = base!,
    ) =>
      fetch(`${base}${path}`, {
        method,
        redirect: "manual",
        headers: {
          "Content-Type": "application/json",
          Origin: source,
          ...(authenticated && cookie ? { Cookie: cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const values = (extra: Record<string, unknown> = {}) => ({
      orderDate: "2026-11-03",
      customerName: `${prefix}-basic`,
      categoryId: parentId,
      subcategoryId: subId,
      quantity: "250",
      unit: "pcs",
      unitPrice: "2000",
      status: "NEW",
      notes: "Cetak é, warna hijau\nLaminasi doff",
      ...extra,
    });
    async function create(extra: Record<string, unknown> = {}) {
      const response = await request("/api/orders", "POST", values(extra));
      expect(response.status).toBe(201);
      const { order } = (await response.json()) as { order: OrderRow };
      ids.push(order.id);
      return order;
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
      expect(
        (
          await request("/api/categories", "POST", {
            name: `${prefix}-kategori`,
            parentId: null,
          })
        ).status,
      ).toBe(201);
      let rows = (await (await request("/api/categories")).json()) as {
        id: string;
        name: string;
      }[];
      parentId = rows.find((r) => r.name === `${prefix}-kategori`)!.id;
      expect(
        (
          await request("/api/categories", "POST", {
            name: `${prefix}-sub`,
            parentId,
          })
        ).status,
      ).toBe(201);
      rows = (await (await request("/api/categories")).json()) as {
        id: string;
        name: string;
      }[];
      subId = rows.find((r) => r.name === `${prefix}-sub`)!.id;
    });
    afterAll(async () => {
      for (const id of ids) {
        const read = await request(`/api/orders/${id}`);
        if (read.status === 200) {
          const row = (await read.json()) as OrderRow;
          await request(`/api/orders/${id}`, "DELETE", {
            updatedAt: row.updatedAt,
          });
        }
      }
      if (db) {
        // Hanya ID fixture dari run ini; tidak melakukan reset atau delete seluruh tabel.
        await db.printOrder.deleteMany({ where: { id: { in: ids } } });
        if (subId)
          await db.productCategory.deleteMany({ where: { id: subId } });
        if (parentId)
          await db.productCategory.deleteMany({ where: { id: parentId } });
        await db.$disconnect();
      } else {
        if (subId) await request(`/api/categories/${subId}`, "DELETE");
        if (parentId) await request(`/api/categories/${parentId}`, "DELETE");
      }
      await request("/api/auth/logout", "POST");
    });
    it("SEC: halaman baru/edit, seluruh endpoint CRUD/status dan kedua format ekspor terlindungi", async () => {
      for (const page of [
        "/permintaan",
        "/permintaan/baru",
        "/permintaan/foreign/edit",
      ])
        expect((await request(page, "GET", undefined, false)).status).toBe(307);
      for (const [path, method] of [
        ["/api/orders", "GET"],
        ["/api/orders", "POST"],
        ["/api/orders/foreign", "GET"],
        ["/api/orders/foreign", "PATCH"],
        ["/api/orders/foreign", "DELETE"],
        ["/api/orders/foreign/status", "PATCH"],
        ["/api/exports/orders?format=csv", "GET"],
        ["/api/exports/orders?format=xlsx", "GET"],
      ])
        expect((await request(path, method, undefined, false)).status).toBe(
          401,
        );
      expect(
        (
          await request(
            "/api/orders",
            "POST",
            values(),
            true,
            "https://evil.test",
          )
        ).status,
      ).toBe(403);
    });
    it("CRUD dan quick status nyata: total server, validasi, versi stale, persistensi dan soft-delete", async () => {
      const cashBefore = db ? await db.cashTransaction.count() : 0;
      for (const invalid of [
        { quantity: "0" },
        { quantity: "-1" },
        { unitPrice: "-1" },
        { totalPrice: "1" },
        { categoryId: subId },
        { subcategoryId: "foreign" },
      ])
        expect(
          (await request("/api/orders", "POST", values(invalid))).status,
        ).toBe(422);
      let row = await create();
      expect(row.totalPrice).toBe("500000");
      const firstVersion = row.updatedAt;
      const edited = await request(`/api/orders/${row.id}`, "PATCH", {
        data: values({ quantity: "300" }),
        updatedAt: row.updatedAt,
      });
      expect(edited.status).toBe(200);
      row = (await edited.json()).order;
      expect(row.totalPrice).toBe("600000");
      expect(
        (
          await request(`/api/orders/${row.id}/status`, "PATCH", {
            status: "NEW",
            updatedAt: firstVersion,
          })
        ).status,
      ).toBe(409);
      for (const status of ["IN_PROGRESS", "COMPLETED", "PICKED_UP"]) {
        const response = await request(
          `/api/orders/${row.id}/status`,
          "PATCH",
          { status, updatedAt: row.updatedAt },
        );
        expect(response.status).toBe(200);
        row = (await response.json()).order;
        expect(
          (await (await request(`/api/orders/${row.id}`)).json()).status,
        ).toBe(status);
      }
      expect((await request(`/permintaan/${row.id}/edit`)).status).toBe(200);
      expect(
        (
          await request(`/api/orders/${row.id}`, "DELETE", {
            updatedAt: row.updatedAt,
          })
        ).status,
      ).toBe(200);
      expect((await request(`/api/orders/${row.id}`)).status).toBe(404);
      if (db) {
        expect(
          (await db.printOrder.findUniqueOrThrow({ where: { id: row.id } }))
            .deletedAt,
        ).not.toBeNull();
        expect(await db.cashTransaction.count()).toBe(cashBefore);
      }
    });
    it("filter gabungan + halaman kedua: CSV/XLSX berisi seluruh 12 hasil, dapat dibaca, aman formula", async () => {
      for (let n = 0; n < 12; n++)
        await create({
          customerName: `${n === 0 ? "=" : ""}${prefix}-target-${n}`,
          status: "IN_PROGRESS",
          orderDate: "2026-11-30",
        });
      await create({
        customerName: `${prefix}-target-luar`,
        status: "NEW",
        orderDate: "2026-11-30",
      });
      const query = new URLSearchParams({
        q: `${prefix}-target`,
        status: "IN_PROGRESS",
        categoryId: parentId,
        subcategoryId: subId,
        start: "2026-11-30",
        end: "2026-11-30",
        page: "2",
        pageSize: "10",
      });
      const page = await (await request(`/api/orders?${query}`)).json();
      expect(page.total).toBe(12);
      expect(page.rows).toHaveLength(2);
      expect((await request(`/permintaan?${query}`)).status).toBe(200);
      const csvResponse = await request(
        `/api/exports/orders?${query}&format=csv`,
      );
      expect(csvResponse.status).toBe(200);
      expect(csvResponse.headers.get("content-disposition")).toMatch(
        /attachment; filename=".*\.csv"/,
      );
      const raw = new Uint8Array(await csvResponse.arrayBuffer());
      expect([...raw.slice(0, 3)]).toEqual([239, 187, 191]);
      const csv = parse(raw, { bom: true, columns: true }) as Record<
        string,
        string
      >[];
      expect(csv).toHaveLength(12);
      expect(csv.some((r) => r["Nama Pelanggan"].startsWith("'="))).toBe(true);
      expect(csv[0]["Total Harga (Rp)"]).toBe("500000");
      const xlsxResponse = await request(
        `/api/exports/orders?${query}&format=xlsx`,
      );
      expect(xlsxResponse.status).toBe(200);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(await xlsxResponse.arrayBuffer());
      expect(book.getWorksheet("Permintaan")?.rowCount).toBe(13);
      expect(book.getWorksheet("Permintaan")?.getCell("I2").value).toBe(500000);
      expect(
        (await request("/api/orders?start=2026-11-30&end=2026-11-01")).status,
      ).toBe(422);
      expect((await request("/api/exports/orders?format=pdf")).status).toBe(
        422,
      );
      const empty = await request(
        `/api/exports/orders?q=${prefix}-absent&format=csv`,
      );
      expect(empty.status).toBe(200);
      expect(
        parse(await empty.text(), { bom: true, columns: true }),
      ).toHaveLength(0);
    });
  },
);
