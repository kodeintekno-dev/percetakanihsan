import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "@/lib/db-client";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
const base = process.env.TEST_BASE_URL,
  url = process.env.TEST_DATABASE_URL,
  email = process.env.TEST_ADMIN_EMAIL,
  password = process.env.TEST_ADMIN_PASSWORD;
if (url && url === process.env.DATABASE_URL)
  throw new Error("Database uji harus terpisah.");
describe.skipIf(!base || !url || !email || !password)(
  "HTTP Hutang-Piutang",
  () => {
    let cookie = "",
      postId = "";
    const id = randomUUID(),
      ref = "HTTP-" + id;
    const request = (
      path: string,
      method = "GET",
      body?: unknown,
      auth = true,
      origin = base!,
    ) =>
      fetch(base + path, {
        method,
        redirect: "manual",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          ...(auth ? { Cookie: cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    beforeAll(async () => {
      const db = createDatabaseClient(url!);
      const post = await db.expensePost.create({
        data: { name: ref, nameKey: ref, group: "PRODUCTION" },
      });
      postId = post.id;
      await db.$disconnect();
    });
    afterAll(async () => {
      const db = createDatabaseClient(url!);
      const payments = await db.tradePayment.findMany({
        where: { invoiceId: id },
      });
      await db.tradePayment.deleteMany({ where: { invoiceId: id } });
      await db.tradeInvoice.deleteMany({ where: { id } });
      await db.cashTransaction.deleteMany({
        where: { id: { in: payments.map((p) => p.cashId) } },
      });
      await db.expensePost.deleteMany({ where: { id: postId } });
      await db.$disconnect();
      if (cookie) await request("/api/auth/logout", "POST");
    });
    it("menjaga autentikasi, origin, validasi, revisi dan transaksi kas tunggal", async () => {
      for (const path of [
        "/hutang-piutang",
        "/hutang-piutang/baru",
        `/hutang-piutang/${id}`,
        `/hutang-piutang/${id}/edit`,
      ])
        expect((await request(path, "GET", undefined, false)).status).toBe(307);
      for (const path of [
        "/api/trade-invoices",
        "/api/exports/trade?format=csv",
        "/api/exports/trade?format=xlsx",
        `/api/trade-invoices/${id}`,
        `/api/trade-invoices/${id}/candidates`,
      ])
        expect((await request(path, "GET", undefined, false)).status).toBe(401);
      for (const [path, method] of [
        [`/api/trade-invoices`, "POST"],
        [`/api/trade-invoices/${id}`, "PATCH"],
        [`/api/trade-invoices/${id}`, "DELETE"],
        [`/api/trade-invoices/${id}/payments`, "POST"],
        [`/api/trade-invoices/${id}/payments/none`, "DELETE"],
      ])
        expect((await request(path, method, {}, false)).status).toBe(401);
      const login = await request(
        "/api/auth/login",
        "POST",
        { email, password },
        false,
      );
      expect(login.status).toBe(200);
      cookie = login.headers.get("set-cookie")!.split(";")[0];
      const body = {
        id,
        kind: "PAYABLE",
        reference: ref,
        partyName: "Pemasok HTTP QA",
        amount: "1500000",
        issueDate: "2026-11-05",
        dueDate: "2026-11-20",
        expensePostId: postId,
      };
      expect(
        (
          await request(
            "/api/trade-invoices",
            "POST",
            body,
            true,
            "https://invalid.example",
          )
        ).status,
      ).toBe(403);
      expect(
        (await request("/api/trade-invoices", "POST", { ...body, amount: "0" }))
          .status,
      ).toBe(422);
      expect(
        (await request("/api/trade-invoices?kind=PAYABLE&kind=RECEIVABLE"))
          .status,
      ).toBe(422);
      expect((await request("/api/trade-invoices", "POST", body)).status).toBe(
        201,
      );
      expect((await request("/api/trade-invoices", "POST", body)).status).toBe(
        201,
      );
      let invoice = await (await request(`/api/trade-invoices/${id}`)).json();
      const payment = {
        mode: "NEW",
        id: randomUUID(),
        updatedAt: invoice.updatedAt,
        amount: "500000",
        transactionDate: "2026-11-10",
      };
      expect(
        (
          await request(
            `/api/trade-invoices/${id}/payments`,
            "POST",
            payment,
            true,
            "https://invalid.example",
          )
        ).status,
      ).toBe(403);
      expect(
        (await request(`/api/trade-invoices/${id}/payments`, "POST", payment))
          .status,
      ).toBe(201);
      expect(
        (await request(`/api/trade-invoices/${id}/payments`, "POST", payment))
          .status,
      ).toBe(201);
      expect(
        (
          await request(`/api/trade-invoices/${id}/payments`, "POST", {
            ...payment,
            id: randomUUID(),
          })
        ).status,
      ).toBe(409);
      invoice = await (await request(`/api/trade-invoices/${id}`)).json();
      expect(invoice.payments).toHaveLength(1);
      expect(invoice.remaining).toBe("1000000");
      const exportQuery = new URLSearchParams({
        kind: "PAYABLE",
        q: ref,
        page: "2",
      });
      for (const format of ["csv", "xlsx"]) {
        const exported = await request(
          `/api/exports/trade?${exportQuery}&format=${format}`,
        );
        expect(exported.status).toBe(200);
        expect(exported.headers.get("cache-control")).toBe("private, no-store");
        expect(exported.headers.get("x-export-row-count")).toBe("1");
        expect(exported.headers.get("x-export-payment-count")).toBe("1");
        if (format === "csv") {
          const rows = parse(await exported.text(), {
            bom: true,
            columns: true,
          }) as Record<string, string>[];
          expect(rows).toHaveLength(2);
          expect(rows[0].sisa).toBe("1000000");
          expect(rows[1].nominal_pembayaran).toBe("500000");
        } else {
          const book = new ExcelJS.Workbook();
          await book.xlsx.load(await exported.arrayBuffer());
          expect(book.worksheets.map((s) => s.name)).toEqual([
            "Tagihan",
            "Pembayaran",
            "Keterangan",
          ]);
          expect(book.getWorksheet("Tagihan")!.getCell("J2").value).toBe(
            1000000,
          );
        }
      }
      for (const query of [
        "format=csv&format=xlsx",
        "format=pdf",
        "format=csv&kind=PAYABLE&kind=RECEIVABLE",
      ])
        expect((await request(`/api/exports/trade?${query}`)).status).toBe(422);
      const cash = await (
        await request(`/api/cash-transactions/${invoice.payments[0].cashId}`)
      ).json();
      expect(
        (
          await request(`/api/cash-transactions/${cash.id}`, "DELETE", {
            updatedAt: cash.updatedAt,
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await request(`/api/trade-invoices/${id}/payments`, "POST", {
            ...payment,
            id: randomUUID(),
            updatedAt: invoice.updatedAt,
            amount: "1000001",
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await request(
            `/api/trade-invoices/${id}/payments/${payment.id}`,
            "DELETE",
            { updatedAt: invoice.updatedAt, reason: "Koreksi pembayaran" },
          )
        ).status,
      ).toBe(200);
      invoice = await (await request(`/api/trade-invoices/${id}`)).json();
      expect(invoice.remaining).toBe("1500000");
      expect(invoice.payments[0].voidedAt).not.toBeNull();
      expect(
        (
          await request(`/api/trade-invoices/${id}`, "DELETE", {
            updatedAt: invoice.updatedAt,
            reason: "Tagihan contoh",
          })
        ).status,
      ).toBe(200);
      const list = await (
        await request(
          "/api/trade-invoices?" +
            new URLSearchParams({
              kind: "PAYABLE",
              status: "CANCELLED",
              q: ref,
            }),
        )
      ).json();
      expect(list.total).toBe(1);
      expect(list.summary.remaining).toBe("0");
    });
  },
);
