import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
const state = vi.hoisted(() => ({
  token: undefined as string | undefined,
  session: null as unknown,
  set: vi.fn(),
  lookup: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (state.token ? { value: state.token } : undefined),
    set: state.set,
  }),
}));
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    session: { findUnique: state.lookup, deleteMany: state.remove },
  }),
}));
import {
  currentAdmin,
  requireAdmin,
  destroySession,
  validToken,
  tokenDigest,
  cookieOptions,
} from "@/lib/auth/session";
import * as categories from "@/app/api/categories/route";
import * as categoryItem from "@/app/api/categories/[id]/route";
import * as posts from "@/app/api/expense-posts/route";
import * as postItem from "@/app/api/expense-posts/[id]/route";
import { assertSameOrigin } from "@/lib/http";
import * as orders from "@/app/api/orders/route";
import * as orderItem from "@/app/api/orders/[id]/route";
import * as orderStatus from "@/app/api/orders/[id]/status/route";
import * as orderExport from "@/app/api/exports/orders/route";
import * as cash from "@/app/api/cash-transactions/route";
import * as cashItem from "@/app/api/cash-transactions/[id]/route";
import * as cashOpening from "@/app/api/cash-opening/route";
import * as cashExport from "@/app/api/exports/cash/route";
import * as dashboard from "@/app/api/dashboard/route";
import * as finance from "@/app/api/finance/summary/route";
import * as allocation from "@/app/api/orders/[id]/allocation/route";
import * as budgets from "@/app/api/budgets/route";
import * as budgetItem from "@/app/api/budgets/[id]/route";
import * as reports from "@/app/api/reports/route";
import * as reportExport from "@/app/api/exports/reports/route";

beforeEach(() => {
  vi.clearAllMocks();
  state.token = undefined;
  process.env.AUTH_SECRET = "test-secret-".repeat(4);
  process.env.APP_ORIGIN = "http://localhost:3000";
});
describe("password", () => {
  it("scrypt dengan salt unik dan perbandingan benar/salah", async () => {
    const first = await hashPassword("Password-123!");
    const second = await hashPassword("Password-123!");
    expect(first).not.toBe(second);
    expect(first).not.toContain("Password-123!");
    expect(await verifyPassword("Password-123!", first)).toBe(true);
    expect(await verifyPassword("wrong", first)).toBe(false);
    expect(await verifyPassword("Password-123!", "corrupt")).toBe(false);
  });
});
describe("SEC-01/03 sesi server", () => {
  it("laporan dan kedua ekspor memverifikasi sesi sebelum query atau agregasi",async()=>{const responses=[await reports.GET(new Request("http://localhost:3000/api/reports")),await reportExport.GET(new Request("http://localhost:3000/api/exports/reports?format=csv")),await reportExport.GET(new Request("http://localhost:3000/api/exports/reports?format=xlsx"))];expect(responses.map(r=>r.status)).toEqual([401,401,401]);expect(state.lookup).not.toHaveBeenCalled();});
  it("seluruh jalur budgeting memverifikasi sesi sebelum database/body", async () => {
    const req = new Request("http://localhost:3000/api/budgets"),
      ctx = { params: Promise.resolve({ id: "foreign" }) };
    const responses = [
      await budgets.GET(req),
      await budgets.POST(req),
      await budgetItem.GET(req, ctx),
      await budgetItem.PATCH(req, ctx),
      await budgetItem.DELETE(req, ctx),
    ];
    expect(responses.map((r) => r.status)).toEqual(Array(5).fill(401));
    expect(state.lookup).not.toHaveBeenCalled();
  });
  it("semua jalur kas, pembukaan, agregasi dan alokasi memeriksa sesi sebelum menyentuh database", async () => {
    const req = new Request("http://localhost:3000/api/cash-transactions"),
      context = { params: Promise.resolve({ id: "foreign" }) };
    const responses = [
      await cash.GET(req),
      await cash.POST(req),
      await cashItem.GET(req, context),
      await cashItem.PATCH(req, context),
      await cashItem.DELETE(req, context),
      await cashOpening.GET(),
      await cashOpening.PUT(req),
      await cashExport.GET(
        new Request("http://localhost:3000/api/exports/cash?format=csv"),
      ),
      await cashExport.GET(
        new Request("http://localhost:3000/api/exports/cash?format=xlsx"),
      ),
      await dashboard.GET(),
      await finance.GET(req),
      await allocation.GET(req, context),
    ];
    expect(responses.map((r) => r.status)).toEqual(Array(12).fill(401));
    expect(state.lookup).not.toHaveBeenCalled();
  });
  it("pesanan, status cepat, detail, dan kedua ekspor memerlukan sesi server", async () => {
    const req = new Request("http://localhost:3000/api/orders");
    const context = { params: Promise.resolve({ id: "foreign" }) };
    const results = [
      await orders.GET(req),
      await orders.POST(req),
      await orderItem.GET(req, context),
      await orderItem.PATCH(req, context),
      await orderItem.DELETE(req, context),
      await orderStatus.PATCH(req, context),
      await orderExport.GET(
        new Request("http://localhost:3000/api/exports/orders?format=csv"),
      ),
      await orderExport.GET(
        new Request("http://localhost:3000/api/exports/orders?format=xlsx"),
      ),
    ];
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(401));
    expect(state.lookup).not.toHaveBeenCalled();
  });
  it("tanpa cookie atau token palsu tidak mengakses database", async () => {
    expect(await currentAdmin()).toBeNull();
    state.token = "forged";
    expect(await currentAdmin()).toBeNull();
    expect(state.lookup).not.toHaveBeenCalled();
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
  });
  it("sesi kedaluwarsa atau admin nonaktif ditolak", async () => {
    state.token = "a".repeat(43);
    state.lookup.mockResolvedValueOnce({
      expiresAt: new Date(0),
      user: { id: "u", email: "x@y.id", disabledAt: null },
    });
    expect(await currentAdmin()).toBeNull();
    state.lookup.mockResolvedValueOnce({
      expiresAt: new Date(Date.now() + 50000),
      user: { id: "u", email: "x@y.id", disabledAt: new Date() },
    });
    expect(await currentAdmin()).toBeNull();
  });
  it("logout menghapus hash dari DB dan mengosongkan cookie", async () => {
    state.token = "a".repeat(43);
    state.remove.mockResolvedValue({ count: 1 });
    await destroySession();
    expect(state.remove).toHaveBeenCalledWith({
      where: { tokenHash: tokenDigest(state.token) },
    });
    expect(state.set).toHaveBeenCalledWith(
      expect.any(String),
      "",
      expect.objectContaining({
        httpOnly: true,
        maxAge: 0,
        sameSite: "lax",
        path: "/",
      }),
    );
    expect(validToken("x".repeat(43))).toBe(true);
    expect(cookieOptions().httpOnly).toBe(true);
  });
  it("semua API master menolak baca/mutasi langsung tanpa sesi", async () => {
    const request = new Request("http://localhost:3000/api/categories", {
      method: "POST",
    });
    const context = { params: Promise.resolve({ id: "foreign" }) };
    const responses = [
      await categories.GET(),
      await posts.GET(),
      await categories.POST(request),
      await posts.POST(request),
      await categoryItem.PATCH(request, context),
      await categoryItem.DELETE(request, context),
      await postItem.PATCH(request, context),
      await postItem.DELETE(request, context),
    ];
    expect(responses.map((r) => r.status)).toEqual(Array(8).fill(401));
    expect(state.lookup).not.toHaveBeenCalled();
  });
  it("menolak origin asing dan origin hilang", () => {
    expect(() =>
      assertSameOrigin(
        new Request("http://localhost:3000", {
          headers: { origin: "https://evil.test" },
        }),
      ),
    ).toThrow();
    expect(() =>
      assertSameOrigin(new Request("http://localhost:3000")),
    ).toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("http://localhost:3000", {
          headers: { origin: "http://localhost:3000" },
        }),
      ),
    ).not.toThrow();
  });
});
