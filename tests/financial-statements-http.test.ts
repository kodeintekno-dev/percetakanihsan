import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportFixture } from "./fixtures/report";
import { preparationSchema } from "@/features/reports/statements";
import { AppError } from "@/lib/app-error";
const state = vi.hoisted(() => ({ auth: vi.fn(), report: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireAdmin: state.auth }));
vi.mock("@/features/reports/service", () => ({ getReport: state.report }));
vi.mock("@/features/reports/preparation-service", () => ({ savePreparation: state.save }));
import * as exports from "@/app/api/exports/reports/route";
import * as preparations from "@/app/api/report-preparations/route";
const origin = "http://localhost:3000";
const body = () => ({ filters: reportFixture().period.filters, statement: "neraca", format: "csv", revision: "1".repeat(64), values: preparationSchema.parse({}) });
const request = (value: unknown, requestOrigin = origin) => new Request(`${origin}/api/exports/reports`, { method: "POST", headers: { "Content-Type": "application/json", Origin: requestOrigin }, body: JSON.stringify(value) });
beforeEach(() => {
  vi.clearAllMocks(); process.env.APP_ORIGIN = origin;
  state.auth.mockResolvedValue({ id: "admin-test" });
  state.report.mockResolvedValue(reportFixture());
});
describe("Ekspor terpisah dan penyimpanan pelengkap", () => {
  it("POST ekspor hanya menyusun laporan, tidak menyimpan pelengkap", async () => {
    const response = await exports.POST(request(body()));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("neraca-2026-11-30.csv");
    expect(response.headers.get("x-report-status")).toBe("draft");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(state.save).not.toHaveBeenCalled();
  });
  it("GET memilih jenis tanpa menyimpan apa pun", async () => {
    const r = await exports.GET(new Request(`${origin}/api/exports/reports?statement=arus-kas&format=csv&year=2026&month=11`));
    expect(r.status).toBe(200); expect(r.headers.get("content-disposition")).toContain("arus-kas-");
    expect(state.save).not.toHaveBeenCalled();
  });
  it("revisi usang ditolak sebelum menghasilkan unduhan", async () => {
    const r = await exports.POST(request({ ...body(), revision: "2".repeat(64) }));
    expect(r.status).toBe(409); expect(state.save).not.toHaveBeenCalled();
  });
  it("semua jalur baru memeriksa autentikasi sebelum membaca data atau body", async () => {
    state.auth.mockRejectedValue(new AppError("Masuk dahulu", 401));
    const responses = await Promise.all([exports.POST(request(body())), preparations.POST(request({})), exports.GET(new Request(`${origin}/api/exports/reports?statement=neraca&format=csv`))]);
    expect(responses.map(r => r.status)).toEqual([401, 401, 401]);
    expect(state.report).not.toHaveBeenCalled(); expect(state.save).not.toHaveBeenCalled();
  });
  it("origin asing, nominal invalid dan body berlebih ditolak sebelum query", async () => {
    const badOrigin = await exports.POST(request(body(), "https://other.invalid"));
    const badValue = await exports.POST(request({ ...body(), values: { capital: "=1+1" } }));
    const tooLarge = await exports.POST(request({ ...body(), extra: "x".repeat(20_000) }));
    expect([badOrigin.status, badValue.status, tooLarge.status]).toEqual([403, 422, 413]);
    expect(state.report).not.toHaveBeenCalled();
  });
  it("simpan pelengkap hanya dipanggil lewat permintaan simpan eksplisit", async () => {
    state.save.mockResolvedValue({ version: 1, savedAt: "2026-11-19T00:00:00Z" });
    const response = await preparations.POST(request({ filters: body().filters, values: body().values, expectedVersion: 0, revision: body().revision }));
    expect(response.status).toBe(201);
    expect(state.save).toHaveBeenCalledWith(body().filters, body().values, 0, "admin-test", "0".repeat(64));
  });
  it("pelengkap dari data yang sudah berubah tidak boleh disimpan sebagai konfirmasi baru", async () => {
    const response = await preparations.POST(request({ filters: body().filters, values: body().values, expectedVersion: 0, revision: "2".repeat(64) }));
    expect(response.status).toBe(409);
    expect(state.save).not.toHaveBeenCalled();
  });
});
