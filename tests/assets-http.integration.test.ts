import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "@/lib/db-client";
const base = process.env.TEST_BASE_URL,
  url = process.env.TEST_DATABASE_URL,
  email = process.env.TEST_ADMIN_EMAIL,
  password = process.env.TEST_ADMIN_PASSWORD;
if (url && url === process.env.DATABASE_URL)
  throw new Error("Database uji harus terpisah.");
describe.skipIf(!base || !url || !email || !password)(
  "HTTP Master Aset",
  () => {
    const id = randomUUID();
    let cookie = "";
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
          "Content-Type": "application/json",
          Origin: origin,
          ...(auth ? { Cookie: cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    afterAll(async () => {
      const db = createDatabaseClient(url!);
      await db.fixedAsset.deleteMany({ where: { id } });
      await db.$disconnect();
      if (cookie) await request("/api/auth/logout", "POST");
    });
    it("menolak akses anonim/origin asing; tambah idempoten, koreksi dengan revisi dan penghentian", async () => {
      expect((await request("/aset", "GET", undefined, false)).status).toBe(
        307,
      );
      for (const path of ["/api/assets", "/api/assets/purchases"])
        expect((await request(path, "GET", undefined, false)).status).toBe(401);
      expect(
        (await request(`/api/assets/${id}`, "PATCH", {}, false)).status,
      ).toBe(401);
      const login = await request(
        "/api/auth/login",
        "POST",
        { email, password },
        false,
      );
      expect(login.status).toBe(200);
      cookie = login.headers.get("set-cookie")!.split(";")[0];
      const values = {
        id,
        name: "QA Aset HTTP",
        acquisitionCost: "24000000",
        startDate: "2026-11-13",
        usefulMonths: 48,
      };
      expect(
        (
          await request(
            "/api/assets",
            "POST",
            values,
            true,
            "https://invalid.example",
          )
        ).status,
      ).toBe(403);
      expect(
        (await request("/api/assets", "POST", { ...values, usefulMonths: 0 }))
          .status,
      ).toBe(422);
      const created = await request("/api/assets", "POST", values);
      expect(created.status).toBe(201);
      let asset = await created.json();
      expect((await request("/api/assets", "POST", values)).status).toBe(201);
      const list = await (await request("/api/assets")).json();
      expect(list.filter((a: { id: string }) => a.id === id)).toHaveLength(1);
      const corrected = await request("/api/assets", "POST", {
        ...values,
        acquisitionCost: "12000000",
        updatedAt: asset.updatedAt,
      });
      expect(corrected.status).toBe(201);
      asset = await corrected.json();
      const report = await (
        await request("/api/reports?mode=month&year=2026&month=11")
      ).json();
      expect(
        report.assets.rows.find((a: { id: string }) => a.id === id).amount,
      ).toBe("250000");
      const stopped = await request(`/api/assets/${id}`, "PATCH", {
        stopDate: "2026-11-30",
        updatedAt: asset.updatedAt,
      });
      expect(stopped.status).toBe(200);
      expect(
        (
          await request(`/api/assets/${id}`, "PATCH", {
            stopDate: null,
            updatedAt: asset.updatedAt,
          })
        ).status,
      ).toBe(409);
    });
  },
);
