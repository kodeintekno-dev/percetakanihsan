import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportFixture } from "./fixtures/report";
import { AppError } from "@/lib/app-error";
const state = vi.hoisted(() => ({ auth: vi.fn(), report: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireAdmin: state.auth }));
vi.mock("@/features/reports/service", () => ({ getReport: state.report }));
import * as exports from "@/app/api/exports/reports/route";
import * as preparations from "@/app/api/report-preparations/route";
const origin = "http://localhost:3000";
const body = () => ({ filters: reportFixture().period.filters, statement: "neraca", format: "csv", revision: "1".repeat(64) });
const request = (value: unknown, requestOrigin = origin) => new Request(`${origin}/api/exports/reports`, { method: "POST", headers: { "Content-Type": "application/json", Origin: requestOrigin }, body: JSON.stringify(value) });
beforeEach(() => {
  vi.clearAllMocks(); process.env.APP_ORIGIN = origin;
  state.auth.mockResolvedValue({ id: "admin-test" }); state.report.mockResolvedValue(reportFixture());
});
describe("API laporan otomatis", () => {
  it("POST neraca otomatis berhasil tanpa nominal manual atau migrasi pelengkap", async () => {
    const response = await exports.POST(request(body()));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("neraca-2026-11-30.csv");
    expect(response.headers.get("x-report-status")).toBe("ready");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).not.toContain("Belum tersedia");
  });
  it("GET memilih satu jenis dengan nilai otomatis", async () => {
    const response = await exports.GET(new Request(`${origin}/api/exports/reports?statement=arus-kas&format=csv&year=2026&month=11`));
    expect(response.status).toBe(200); expect(response.headers.get("content-disposition")).toContain("arus-kas-");
  });
  it("nominal manual dari klien tidak dapat mengganti hasil perhitungan", async () => {
    const response = await exports.POST(request({ ...body(), values: { capital: "99999999", retainedEarnings: "0" } }));
    expect(response.status).toBe(422); expect(state.report).not.toHaveBeenCalled();
  });
  it("revisi usang ditolak", async () => {
    expect((await exports.POST(request({ ...body(), revision: "2".repeat(64) }))).status).toBe(409);
  });
  it("autentikasi diperiksa sebelum laporan atau endpoint lama", async () => {
    state.auth.mockRejectedValue(new AppError("Masuk dahulu", 401));
    const responses = await Promise.all([exports.POST(request(body())), preparations.POST(request({})), exports.GET(new Request(`${origin}/api/exports/reports?statement=neraca&format=csv`))]);
    expect(responses.map(response => response.status)).toEqual([401, 401, 401]);
    expect(state.report).not.toHaveBeenCalled();
  });
  it("origin asing, jenis invalid, dan body berlebih ditolak sebelum query", async () => {
    const responses = await Promise.all([
      exports.POST(request(body(), "https://other.invalid")), exports.POST(request({ ...body(), statement: "invalid" })),
      exports.POST(request({ ...body(), extra: "x".repeat(20_000) })),
    ]);
    expect(responses.map(response => response.status)).toEqual([403, 422, 413]); expect(state.report).not.toHaveBeenCalled();
  });
  it("endpoint pelengkap lama dihentikan tanpa membaca/menulis database laporan", async () => {
    const response = await preparations.POST(request({ values: { capital: "123" } }));
    expect(response.status).toBe(410); expect(state.report).not.toHaveBeenCalled();
  });
});
