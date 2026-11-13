"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import type { TradeFilters } from "./schema";
export function TradeExportButtons({ filters }: { filters: TradeFilters }) {
  const router = useRouter(),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  async function download(format: "xlsx" | "csv") {
    setBusy(format);
    setError("");
    try {
      const response = await fetch(
        `/api/exports/trade?${new URLSearchParams({ ...filters, page: String(filters.page), format })}`,
      );
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        setError((await response.json()).error);
        return;
      }
      const url = URL.createObjectURL(await response.blob()),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        response.headers
          .get("content-disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? `tagihan.${format}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Ekspor gagal diunduh. Periksa koneksi lalu coba kembali.");
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="trade-export">
      <div className="trade-actions">
        {(["xlsx", "csv"] as const).map((format) => (
          <button
            type="button"
            className="button secondary"
            key={format}
            disabled={!!busy}
            onClick={() => void download(format)}
          >
            <Download size={16} />
            {busy === format
              ? "Menyiapkan…"
              : format === "xlsx"
                ? "Excel (.xlsx)"
                : "CSV (.csv)"}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
