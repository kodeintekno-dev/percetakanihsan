import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "@/lib/db-client";
import type { BudgetDetail } from "@/features/budget/schema";
const base = process.env.TEST_BASE_URL,
  email = process.env.TEST_ADMIN_EMAIL,
  password = process.env.TEST_ADMIN_PASSWORD,
  url = process.env.TEST_DATABASE_URL;
if (url && url === process.env.DATABASE_URL)
  throw new Error("Gunakan database TEST terpisah.");
describe.skipIf(!base || !email || !password || !url)(
  "HTTP Budgeting HPP/CUT dan SEC",
  () => {
    const db = createDatabaseClient(url!),
      prefix = `http-hpp-${randomUUID().slice(0, 8)}`,
      ids: string[] = [];
    let cookie = "",
      categoryId = "",
      subcategoryId = "";
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
      title: prefix,
      categoryId,
      subcategoryId,
      quantity: "100",
      unit: "pcs",
      marginMode: "PERCENT_MARKUP",
      marginValue: "20",
      items: [
        {
          label: "Kertas",
          costType: "PAPER",
          quantity: "7",
          unitCost: "10000",
          fromPaperCut: true,
        },
        {
          label: "Cetak",
          costType: "INK_PRINT",
          quantity: "1",
          unitCost: "430000",
        },
      ],
      paperCut: {
        sheetLengthCm: "107",
        sheetWidthCm: "80",
        cutLengthCm: "26",
        cutWidthCm: "20,5",
        selectedOrientation: "rotated",
        material: {
          requiredFinishedPieces: "100",
          paperPricePerSheet: "10000",
        },
      },
      ...extra,
    });
    async function create(extra: Record<string, unknown> = {}) {
      const response = await request("/api/budgets", "POST", values(extra));
      expect(response.status).toBe(201);
      const { budget } = (await response.json()) as { budget: BudgetDetail };
      ids.push(budget.id);
      return budget;
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
      categoryId = (
        await db.productCategory.create({
          data: { name: prefix, nameKey: prefix },
        })
      ).id;
      subcategoryId = (
        await db.productCategory.create({
          data: {
            name: `${prefix}-sub`,
            nameKey: `${prefix}-sub`,
            parentId: categoryId,
          },
        })
      ).id;
    });
    afterAll(async () => {
      await db.budgetEstimate.deleteMany({ where: { id: { in: ids } } });
      if (subcategoryId)
        await db.productCategory.deleteMany({ where: { id: subcategoryId } });
      if (categoryId)
        await db.productCategory.deleteMany({ where: { id: categoryId } });
      await request("/api/auth/logout", "POST");
      await db.$disconnect();
    });
    it("SEC: seluruh halaman/API read/create/edit/delete memerlukan sesi dan mutasi memeriksa origin", async () => {
      for (const path of [
        "/budgeting",
        "/budgeting/baru",
        "/budgeting/foreign",
        "/budgeting/foreign/edit",
      ])
        expect((await request(path, "GET", undefined, false)).status).toBe(307);
      for (const [path, method] of [
        ["/api/budgets", "GET"],
        ["/api/budgets", "POST"],
        ["/api/budgets/foreign", "GET"],
        ["/api/budgets/foreign", "PATCH"],
        ["/api/budgets/foreign", "DELETE"],
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
            "/api/budgets",
            "POST",
            values(),
            true,
            "https://evil.test",
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await request(
            "/api/budgets/foreign",
            "PATCH",
            {},
            true,
            "https://evil.test",
          )
        ).status,
      ).toBe(403);
    });
    it("CUT/HPP: create-read persisten, server menolak spoof hasil/total dan edit mengubah komponen atomik tanpa kas", async () => {
      const cashBefore = await db.cashTransaction.count();
      let row = await create();
      expect(row).toMatchObject({
        totalHpp: "500000",
        hppPerUnit: "5000.0000",
        suggestedSellingTotal: "600000",
      });
      expect(row.paperSnapshot?.calculation).toMatchObject({
        original: { yield: "12", wasteAreaCm2: "2164" },
        rotated: { yield: "15", wasteAreaCm2: "565" },
      });
      expect(row.paperSnapshot?.material).toMatchObject({
        requiredParentSheets: "7",
        totalCost: "70000",
        extraPieces: "5",
      });
      const read = await request(`/api/budgets/${row.id}`);
      expect(read.status).toBe(200);
      expect((await read.json()).paperSnapshot).toEqual(row.paperSnapshot);
      expect((await request(`/budgeting/${row.id}`)).status).toBe(200);
      expect((await request(`/budgeting/${row.id}/edit`)).status).toBe(200);
      for (const data of [
        values({ totalHpp: "1" }),
        values({ quantity: "0" }),
        values({
          items: [
            {
              label: "Palsu",
              costType: "PAPER",
              quantity: "1",
              unitCost: "1",
              fromPaperCut: true,
            },
          ],
        }),
        values({ paperCut: { ...values().paperCut, originalYield: 100 } }),
      ])
        expect((await request("/api/budgets", "POST", data)).status).toBe(422);
      const old = row;
      const edited = await request(`/api/budgets/${row.id}`, "PATCH", {
        updatedAt: row.updatedAt,
        data: values({
          marginMode: "FIXED_AMOUNT",
          marginValue: "100000",
          items: [
            {
              label: "Finishing",
              costType: "FINISHING",
              quantity: "2",
              unitCost: "250000",
            },
          ],
          paperCut: null,
        }),
      });
      expect(edited.status).toBe(200);
      row = (await edited.json()).budget;
      expect(row).toMatchObject({
        totalHpp: "500000",
        suggestedSellingTotal: "600000",
        costCount: 1,
        paperSnapshot: null,
      });
      expect(
        (
          await request(`/api/budgets/${row.id}`, "PATCH", {
            updatedAt: old.updatedAt,
            data: values(),
          })
        ).status,
      ).toBe(409);
      expect(await db.cashTransaction.count()).toBe(cashBefore);
    });
    it("lebih dari 16KiB komponen didukung, filter gabungan/pagination dan input oversized ditangani", async () => {
      const items = Array.from({ length: 180 }, (_, i) => ({
        label: `Komponen biaya ${i + 1} untuk hasil cetak`,
        costType: "CUSTOM",
        quantity: "1",
        unitCost: "1000",
      }));
      expect(JSON.stringify(items).length).toBeGreaterThan(16384);
      const big = await create({
        title: `${prefix}-massal`,
        items,
        paperCut: null,
        marginValue: "0",
      });
      expect(big.costCount).toBe(180);
      expect(big.totalHpp).toBe("180000");
      for (let i = 0; i < 12; i++)
        await create({
          title: `${prefix}-filter100%_é`,
          items: [],
          paperCut: null,
        });
      const query = new URLSearchParams({
        q: `${prefix}-filter100%_é`,
        categoryId,
        subcategoryId,
        page: "2",
        pageSize: "10",
      });
      const response = await request(`/api/budgets?${query}`);
      expect(response.status).toBe(200);
      const list = await response.json();
      expect(list.total).toBe(12);
      expect(list.rows).toHaveLength(2);
      expect(
        (await request("/api/budgets?start=2026-11-03&end=2026-11-01")).status,
      ).toBe(422);
      expect(
        (
          await request("/api/budgets", "POST", {
            large: "x".repeat(1_048_577),
          })
        ).status,
      ).toBe(413);
    });
    it("hapus dengan revisi menyimpan snapshot historis dan menolak read/edit record terhapus", async () => {
      const cashBefore = await db.cashTransaction.count(),
        row = await create();
      expect(
        (
          await request(`/api/budgets/${row.id}`, "DELETE", {
            updatedAt: row.updatedAt,
          })
        ).status,
      ).toBe(200);
      expect((await request(`/api/budgets/${row.id}`)).status).toBe(404);
      expect(
        (
          await request(`/api/budgets/${row.id}`, "PATCH", {
            updatedAt: row.updatedAt,
            data: values(),
          })
        ).status,
      ).toBe(404);
      const stored = await db.budgetEstimate.findUniqueOrThrow({
        where: { id: row.id },
        include: { costItems: true, paperCut: true },
      });
      expect(stored.deletedAt).not.toBeNull();
      expect(stored.costItems).toHaveLength(2);
      expect(stored.paperCut?.calculationSnapshot).not.toBeNull();
      expect(await db.cashTransaction.count()).toBe(cashBefore);
    });
  },
);
