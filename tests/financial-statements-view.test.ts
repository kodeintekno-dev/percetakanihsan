import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { reportFixture } from "./fixtures/report";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
import { ReportView } from "@/features/reports/report-view";

describe("Tampilan laporan tanpa isian pelengkap", () => {
  it.each(["neraca", "laba-rugi", "arus-kas"] as const)("%s hanya meminta periode dan menghasilkan angka otomatis", kind => {
    const html = renderToStaticMarkup(createElement(ReportView, { data: reportFixture(), initialKind: kind }));
    expect(html.match(/<form/g)).toHaveLength(1);
    expect(html).not.toContain("Data pelengkap laporan");
    expect(html).not.toContain("Simpan versi pelengkap");
    expect(html).not.toContain("Belum tersedia");
    expect(html).not.toContain("Kelengkapan telah dikonfirmasi");
    expect(html).toContain("Disusun otomatis dari data tercatat");
    expect(html).toContain("Excel siap cetak");
    expect(html).toContain(kind === "laba-rugi" ? "600.000" : "2.600.000");
  });
});
