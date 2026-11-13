"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Link2,
  LoaderCircle,
  Search,
  SearchX,
  Unlink,
  RefreshCw,
  X,
} from "lucide-react";
import {
  orderStatuses,
  type OrderPage,
  type OrderRow,
} from "@/features/orders/schema";
import { displayDate } from "@/lib/date";
import { formatQuantity, formatRupiah } from "@/lib/money";

export function CashOrderPicker({
  order,
  onChange,
  disabled,
  description,
  error,
  children,
  required = false,
}: {
  order: OrderRow | null;
  onChange: (row: OrderRow | null) => void;
  disabled: boolean;
  description: string;
  error?: string;
  children?: ReactNode;
  required?: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const changeButton = useRef<HTMLButtonElement>(null);
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<OrderPage | null>(null);
  const [searchError, setSearchError] = useState("");
  const [active, setActive] = useState(-1);
  const [searchedQuery, setSearchedQuery] = useState("");

  useEffect(
    () => () => {
      controller.current?.abort();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function cancelSearch() {
    controller.current?.abort();
    if (timer.current) clearTimeout(timer.current);
  }

  function closeSearch() {
    cancelSearch();
    setOpen(false);
    setLoading(false);
    setActive(-1);
  }

  async function search(value = query, page = 1) {
    cancelSearch();
    const request = new AbortController();
    controller.current = request;
    setOpen(true);
    setLoading(true);
    setSearchError("");
    setResults(null);
    setActive(-1);
    setSearchedQuery(value.trim());
    try {
      const params = new URLSearchParams({
        q: value.trim(),
        page: String(page),
        pageSize: "10",
      });
      const response = await fetch(`/api/orders?${params}`, {
        signal: request.signal,
      });
      const payload: OrderPage & { error?: string } = await response.json();
      if (request.signal.aborted) return;
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        setSearchError(payload.error ?? "Pesanan belum dapat dimuat.");
        return;
      }
      setResults(payload);
    } catch {
      if (!request.signal.aborted)
        setSearchError("Koneksi terputus. Coba cari pesanan kembali.");
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }

  function updateQuery(value: string) {
    cancelSearch();
    setQuery(value);
    setOpen(true);
    setLoading(true);
    setResults(null);
    setSearchError("");
    setActive(-1);
    timer.current = setTimeout(() => void search(value), 300);
  }

  function choose(row: OrderRow) {
    closeSearch();
    setEditing(false);
    setQuery("");
    setResults(null);
    onChange(row);
    requestAnimationFrame(() => changeButton.current?.focus());
  }

  function moveActive(index: number) {
    setActive(index);
    requestAnimationFrame(() => {
      document
        .getElementById(`${id}-option-${index}`)
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  const showSearch = !order || editing;
  return (
    <section className="cash-picker" aria-labelledby={`${id}-title`}>
      <div className="cash-picker-heading">
        <span className="cash-picker-icon">
          <Link2 size={19} aria-hidden="true" />
        </span>
        <div>
          <div className="cash-picker-title">
            <h3 id={`${id}-title`}>Hubungkan pesanan</h3>
            <span className="cash-picker-optional">
              {required ? "Wajib" : "Opsional"}
            </span>
          </div>
          <p id={`${id}-description`}>{description}</p>
        </div>
      </div>

      {order && (
        <div className="cash-picker-selected">
          <div className="cash-picker-connected">
            <Check size={14} aria-hidden="true" /> Pesanan terhubung
          </div>
          <div className="cash-picker-selection">
            <div className="cash-picker-document">
              <FileText size={22} aria-hidden="true" />
            </div>
            <div className="cash-picker-selection-body">
              <div className="cash-picker-selection-top">
                <span className="cash-picker-code">{order.orderNumber}</span>
                <span
                  className={`cash-picker-status cash-picker-status-${order.status}`}
                >
                  {orderStatuses[order.status]}
                </span>
              </div>
              <strong className="cash-picker-customer">
                {order.customerName}
              </strong>
              <p>
                {order.productNameSnapshot} <span aria-hidden="true">·</span>{" "}
                {formatQuantity(order.quantity)} {order.unit}
              </p>
              <dl className="cash-picker-facts">
                <div>
                  <dt>Tanggal pesanan</dt>
                  <dd>{displayDate(order.orderDate)}</dd>
                </div>
                <div>
                  <dt>Nilai pesanan</dt>
                  <dd>{formatRupiah(order.totalPrice)}</dd>
                </div>
              </dl>
            </div>
          </div>
          {children && <div className="cash-picker-note">{children}</div>}
          <div className="cash-picker-actions">
            <button
              ref={changeButton}
              type="button"
              disabled={disabled}
              onClick={() => {
                setEditing(!editing);
                if (editing) closeSearch();
                else requestAnimationFrame(() => input.current?.focus());
              }}
            >
              {editing ? (
                <X size={15} aria-hidden="true" />
              ) : (
                <RefreshCw size={15} aria-hidden="true" />
              )}
              {editing ? "Batal ganti" : "Ganti pesanan"}
            </button>
            <button
              type="button"
              className="cash-picker-unlink"
              disabled={disabled}
              onClick={() => {
                closeSearch();
                setEditing(false);
                setQuery("");
                setResults(null);
                onChange(null);
                requestAnimationFrame(() => input.current?.focus());
              }}
            >
              <Unlink size={15} aria-hidden="true" /> Lepaskan
            </button>
          </div>
        </div>
      )}

      {showSearch && (
        <div
          className="cash-picker-search-area"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              closeSearch();
          }}
        >
          <label htmlFor={`${id}-search`} className="cash-picker-label">
            {order ? "Cari pengganti pesanan" : "Cari pesanan"}
          </label>
          <div className="cash-picker-search-bar">
            <div className="cash-picker-input-wrap">
              <Search size={18} aria-hidden="true" />
              <input
                id={`${id}-search`}
                ref={input}
                role="combobox"
                aria-expanded={open}
                aria-controls={`${id}-results`}
                aria-autocomplete="list"
                aria-activedescendant={
                  open && active >= 0 ? `${id}-option-${active}` : undefined
                }
                aria-describedby={error ? `${id}-error` : `${id}-description`}
                aria-invalid={!!error}
                autoComplete="off"
                placeholder="Nama pelanggan, produk, atau kode pesanan"
                value={query}
                maxLength={150}
                disabled={disabled}
                onFocus={() => {
                  if (!open) void search();
                }}
                onChange={(event) => updateQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (!loading && results?.rows[active])
                      choose(results.rows[active]);
                    else void search();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    closeSearch();
                  } else if (
                    event.key === "ArrowDown" ||
                    event.key === "ArrowUp"
                  ) {
                    event.preventDefault();
                    if (!open) void search();
                    else if (results?.rows.length)
                      moveActive(
                        event.key === "ArrowDown"
                          ? Math.min(active + 1, results.rows.length - 1)
                          : Math.max(active - 1, 0),
                      );
                  }
                }}
              />
              {query && (
                <button
                  type="button"
                  className="cash-picker-clear"
                  aria-label="Kosongkan pencarian pesanan"
                  disabled={disabled}
                  onClick={() => {
                    updateQuery("");
                    input.current?.focus();
                  }}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            <button
              type="button"
              className="cash-picker-search-button"
              disabled={disabled || loading}
              onClick={() => void search()}
            >
              {loading ? (
                <LoaderCircle
                  className="cash-picker-spin"
                  size={16}
                  aria-hidden="true"
                />
              ) : (
                <Search size={16} aria-hidden="true" />
              )}
              {loading ? "Mencari" : "Cari"}
            </button>
          </div>

          {!open && (
            <p className="cash-picker-hint">
              Ketik untuk mencari, atau buka kolom untuk melihat pesanan
              terbaru.
            </p>
          )}
          {open && (
            <div className="cash-picker-results-panel">
              <div className="cash-picker-results-heading">
                <strong>
                  {searchedQuery ? "Hasil pencarian" : "Pesanan terbaru"}
                </strong>
                {results && <span>{results.total} pesanan</span>}
              </div>
              <div
                role="status"
                aria-live="polite"
                className={
                  loading || searchError || (results && !results.rows.length)
                    ? "cash-picker-state"
                    : "sr-only"
                }
              >
                {loading ? (
                  <>
                    <LoaderCircle
                      className="cash-picker-spin"
                      size={23}
                      aria-hidden="true"
                    />
                    <strong>Mencari pesanan…</strong>
                    <span>Menyiapkan daftar pesanan untuk Anda.</span>
                  </>
                ) : searchError ? (
                  <>
                    <SearchX size={24} aria-hidden="true" />
                    <strong>Pesanan belum dapat dimuat</strong>
                    <span>{searchError}</span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void search()}
                    >
                      Coba lagi
                    </button>
                  </>
                ) : results && !results.rows.length ? (
                  <>
                    <SearchX size={26} aria-hidden="true" />
                    <strong>Tidak ada pesanan yang cocok</strong>
                    <span>
                      Coba nama pelanggan, produk, atau kode pesanan lain.
                    </span>
                  </>
                ) : results ? (
                  `${results.total} pesanan ditemukan. Gunakan panah atas dan bawah untuk memilih.`
                ) : (
                  ""
                )}
              </div>
              <div
                id={`${id}-results`}
                role="listbox"
                aria-label="Hasil pencarian pesanan"
                aria-busy={loading}
                className="cash-picker-results"
              >
                {results?.rows.map((row, index) => (
                  <button
                    key={row.id}
                    id={`${id}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={active === index}
                    tabIndex={-1}
                    className={`cash-picker-result${active === index ? " is-active" : ""}`}
                    disabled={disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onPointerMove={() => setActive(index)}
                    onClick={() => choose(row)}
                  >
                    <span className="cash-picker-result-icon">
                      <FileText size={18} aria-hidden="true" />
                    </span>
                    <span className="cash-picker-result-body">
                      <span className="cash-picker-result-top">
                        <span className="cash-picker-code">
                          {row.orderNumber}
                        </span>
                        <span
                          className={`cash-picker-status cash-picker-status-${row.status}`}
                        >
                          {orderStatuses[row.status]}
                        </span>
                      </span>
                      <strong>{row.customerName}</strong>
                      <span className="cash-picker-product">
                        {row.productNameSnapshot} ·{" "}
                        {formatQuantity(row.quantity)} {row.unit}
                      </span>
                      <span className="cash-picker-result-bottom">
                        <span>{displayDate(row.orderDate)}</span>
                        <strong>{formatRupiah(row.totalPrice)}</strong>
                      </span>
                    </span>
                    <ArrowRight
                      size={17}
                      className="cash-picker-result-arrow"
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
              {results && results.totalPages > 1 && (
                <div className="cash-picker-pagination">
                  <button
                    type="button"
                    aria-label="Pesanan sebelumnya"
                    disabled={disabled || loading || results.page <= 1}
                    onClick={() => void search(searchedQuery, results.page - 1)}
                  >
                    <ChevronLeft size={17} aria-hidden="true" />
                  </button>
                  <span>
                    Halaman <strong>{results.page}</strong> dari{" "}
                    {results.totalPages}
                  </span>
                  <button
                    type="button"
                    aria-label="Pesanan berikutnya"
                    disabled={
                      disabled || loading || results.page >= results.totalPages
                    }
                    onClick={() => void search(searchedQuery, results.page + 1)}
                  >
                    <ChevronRight size={17} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {error && (
        <p
          className="field-error cash-picker-error"
          id={`${id}-error`}
          role="alert"
        >
          {error}
        </p>
      )}
      <input type="hidden" name="orderId" value={order?.id ?? ""} />
    </section>
  );
}
