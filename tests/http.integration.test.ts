import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

const base = process.env.TEST_BASE_URL;
const email = process.env.TEST_ADMIN_EMAIL;
const password = process.env.TEST_ADMIN_PASSWORD;
describe.skipIf(!base || !email || !password)(
  "HTTP aplikasi berjalan: SEC-01..03 dan CRUD",
  () => {
    const origin = base!;
    const request = (
      path: string,
      method = "GET",
      body?: unknown,
      cookie?: string,
      source = origin,
    ) =>
      fetch(`${origin}${path}`, {
        method,
        redirect: "manual",
        headers: {
          Origin: source,
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    async function signIn() {
      const response = await request("/api/auth/login", "POST", {
        email,
        password,
      });
      expect(response.status).toBe(200);
      const cookie = response.headers.get("set-cookie")!;
      expect(cookie.toLowerCase()).toContain("httponly");
      expect(cookie.toLowerCase()).toContain("samesite=lax");
      return cookie.split(";")[0];
    }
    it("halaman dan semua operasi master menolak sesi hilang/palsu", async () => {
      for (const page of [
        "/dashboard",
        "/kategori-produk",
        "/pos-pengeluaran",
        "/permintaan",
        "/buku-kas",
        "/budgeting",
        "/laporan",
        "/pengaturan",
      ]) {
        const response = await request(page);
        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("/login");
      }
      for (const endpoint of ["/api/categories", "/api/expense-posts"]) {
        expect((await request(endpoint)).status).toBe(401);
        expect(
          (await request(endpoint, "POST", { name: "Tanpa sesi" })).status,
        ).toBe(401);
        expect(
          (
            await request(`${endpoint}/foreign`, "PATCH", {
              name: "Tanpa sesi",
            })
          ).status,
        ).toBe(401);
        expect((await request(`${endpoint}/foreign`, "DELETE")).status).toBe(
          401,
        );
        expect(
          (await request(endpoint, "GET", undefined, "ihsan_session=forged"))
            .status,
        ).toBe(401);
      }
    });
    it("login, validasi langsung, persistensi reload, dan logout revokasi sesi", async () => {
      expect(
        (
          await request(
            "/api/auth/login",
            "POST",
            { email, password },
            undefined,
            "https://evil.test",
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await request("/api/auth/login", "POST", {
            email,
            password: "wrong-password",
          })
        ).status,
      ).toBe(401);
      const cookie = await signIn();
      const name = `http-${randomUUID().slice(0, 8)}`;
      let id: string | undefined;
      try {
        expect(
          (
            await request(
              "/api/categories",
              "POST",
              { name, parentId: "missing" },
              cookie,
            )
          ).status,
        ).toBe(422);
        expect(
          (
            await request(
              "/api/categories",
              "POST",
              { name, parentId: null, spoof: true },
              cookie,
            )
          ).status,
        ).toBe(422);
        expect(
          (
            await request(
              "/api/expense-posts",
              "POST",
              { name, group: "INVALID" },
              cookie,
            )
          ).status,
        ).toBe(422);
        expect(
          (
            await request(
              "/api/categories",
              "POST",
              { name, parentId: null },
              cookie,
              "https://evil.test",
            )
          ).status,
        ).toBe(403);
        expect(
          (
            await request(
              "/api/categories",
              "POST",
              { name, parentId: null },
              cookie,
            )
          ).status,
        ).toBe(201);
        const rows = (await (
          await request("/api/categories", "GET", undefined, cookie)
        ).json()) as { id: string; name: string }[];
        id = rows.find((row) => row.name === name)?.id;
        expect(id).toBeTruthy();
        expect(
          (
            await request(
              "/api/categories",
              "POST",
              { name: name.toUpperCase(), parentId: null },
              cookie,
            )
          ).status,
        ).toBe(409);
        const page = await request(
          "/kategori-produk",
          "GET",
          undefined,
          cookie,
        );
        expect(page.status).toBe(200);
        expect(await page.text()).toContain(name);
        expect(
          (
            await request(
              `/api/categories/${id}`,
              "PATCH",
              { name: `${name}-edit`, parentId: null, isActive: true },
              cookie,
            )
          ).status,
        ).toBe(200);
        const reload = await request(
          "/kategori-produk",
          "GET",
          undefined,
          cookie,
        );
        expect(await reload.text()).toContain(`${name}-edit`);
      } finally {
        if (id)
          expect(
            (
              await request(
                `/api/categories/${id}`,
                "DELETE",
                undefined,
                cookie,
              )
            ).status,
          ).toBe(200);
      }
      expect(
        (await request("/api/auth/logout", "POST", undefined, cookie)).status,
      ).toBe(200);
      expect(
        (await request("/api/categories", "GET", undefined, cookie)).status,
      ).toBe(401);
      expect(
        (await request("/dashboard", "GET", undefined, cookie)).status,
      ).toBe(307);
    });
    it("pembatasan login tetap aktif pada akun yang tidak ada", async () => {
      const unknown = `unknown-${randomUUID()}@example.test`;
      for (let n = 0; n < 8; n++)
        expect(
          (
            await request("/api/auth/login", "POST", {
              email: unknown,
              password: "wrong-password",
            })
          ).status,
        ).toBe(401);
      expect(
        (
          await request("/api/auth/login", "POST", {
            email: unknown,
            password: "wrong-password",
          })
        ).status,
      ).toBe(429);
    });
  },
);
