"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Unlink, ChevronLeft, ChevronRight } from "lucide-react";
import type { OrderRow, OrderPage } from "@/features/orders/schema";
import { formatQuantity } from "@/lib/money";
export function BudgetOrderPicker({
  order,
  onChange,
  disabled,
}: {
  order: OrderRow | null;
  onChange: (row: OrderRow | null) => void;
  disabled: boolean;
}) {
  const router = useRouter(),
    [q, setQ] = useState(""),
    [results, setResults] = useState<OrderPage | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  async function search(page = 1) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/orders?${new URLSearchParams({ q, page: String(page), pageSize: "10" })}`,
      );
      const value = await response.json();
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        setError(value.error);
        return;
      }
      setResults(value);
    } catch {
      setError("Pesanan belum dapat dimuat. Coba kembali.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="budget-order-picker">
      <h3>Pesanan terkait (opsional)</h3>
      <p className="budget-hint">
        Memilih pesanan mengisi kategori, jumlah, dan satuan estimasi. Anda
        dapat menyesuaikan jumlah estimasi; pesanan asli tetap utuh.
      </p>
      <div className="cash-order-search">
        <input
          aria-label="Cari pesanan untuk estimasi"
          value={q}
          maxLength={150}
          placeholder="Pelanggan, produk, atau kode pesanan"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
        />
        <button
          type="button"
          className="button secondary"
          disabled={disabled || loading}
          onClick={() => void search()}
        >
          <Search size={16} />
          {loading ? "Mencari…" : "Cari pesanan"}
        </button>
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {results && (
        <div>
          {results.rows.map((row) => (
            <button
              type="button"
              className="cash-order-option"
              key={row.id}
              disabled={disabled || loading}
              onClick={() => {
                onChange(row);
                setResults(null);
              }}
            >
              <strong>{row.customerName}</strong>
              <span>
                {row.productNameSnapshot} · {formatQuantity(row.quantity)}{" "}
                {row.unit}
              </span>
              <small>{row.orderNumber}</small>
            </button>
          ))}
          {!results.rows.length && (
            <p className="budget-hint">Tidak ada pesanan yang cocok.</p>
          )}
          <div className="cash-order-pagination">
            <button
              type="button"
              className="icon-button"
              aria-label="Pesanan sebelumnya"
              disabled={loading || results.page <= 1}
              onClick={() => void search(results.page - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Halaman {results.page} / {results.totalPages}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Pesanan berikutnya"
              disabled={loading || results.page >= results.totalPages}
              onClick={() => void search(results.page + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
      {order && (
        <div className="cash-linked-order">
          <div>
            <strong>{order.customerName}</strong>
            <small>
              {order.orderNumber} · {formatQuantity(order.quantity)}{" "}
              {order.unit}
            </small>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Lepaskan pesanan dari estimasi"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <Unlink size={17} />
          </button>
        </div>
      )}
      <input type="hidden" name="orderId" value={order?.id ?? ""} />
    </div>
  );
}
