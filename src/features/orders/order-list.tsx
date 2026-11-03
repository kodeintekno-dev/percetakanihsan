"use client";
import { notifyDataChanged } from "@/lib/notify-data-changed";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Download,
  Pencil,
  Trash2,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Modal } from "@/components/modal";
import type { CategoryRow } from "@/features/categories/schema";
import {
  orderStatuses,
  orderQuery,
  filterSchema,
  type OrderFilters,
  type OrderPage,
  type OrderRow,
} from "./schema";
import { displayDate } from "@/lib/date";
import { formatQuantity, formatRupiah } from "@/lib/money";

export function OrderList({
  data,
  categories,
  filters,
  notice,
}: {
  data: OrderPage;
  categories: CategoryRow[];
  filters: OrderFilters;
  notice?: string;
}) {
  const router = useRouter();
  const [transition, startTransition] = useTransition();
  const [draft, setDraft] = useState(filters);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState(
    notice === "created"
      ? "Permintaan berhasil ditambahkan."
      : notice === "updated"
        ? "Permintaan berhasil diperbarui."
        : "",
  );
  const [deleting, setDeleting] = useState<OrderRow | null>(null);
  const pending = !!busy || transition;
  async function mutate(
    row: OrderRow,
    method: "PATCH" | "DELETE",
    status?: string,
  ) {
    setBusy(row.id);
    setError("");
    try {
      const response = await fetch(
        `/api/orders/${row.id}${status ? "/status" : ""}`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            updatedAt: row.updatedAt,
            ...(status ? { status } : {}),
          }),
        },
      );
      const result = await response.json();
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        setError(result.error);
        return;
      }
      setMessage(result.message);
      setDeleting(null);
      notifyDataChanged();
      startTransition(() => router.refresh());
    } catch {
      setError("Koneksi terputus. Muat ulang daftar sebelum mencoba kembali.");
    } finally {
      setBusy("");
    }
  }
  function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsed = parseOrderFiltersSafe({
      ...Object.fromEntries(new FormData(event.currentTarget)),
      page: 1,
    });
    if (typeof parsed === "string") {
      setError(parsed);
      return;
    }
    startTransition(() => router.push(`/permintaan?${orderQuery(parsed, 1)}`));
  }
  async function download(format: "csv" | "xlsx") {
    setBusy(`export-${format}`);
    setError("");
    try {
      const response = await fetch(
        `/api/exports/orders?${orderQuery(filters)}&format=${format}`,
      );
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        setError((await response.json()).error);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? `permintaan.${format}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        `Ekspor ${format.toUpperCase()} selesai: ${response.headers.get("X-Export-Row-Count") ?? "seluruh"} permintaan sesuai filter aktif.`,
      );
    } catch {
      setError("Ekspor gagal diunduh. Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy("");
    }
  }
  const statusControl = (row: OrderRow) => (
    <div className="order-status-control">
      <span className={`order-status status-${row.status}`}>
        {orderStatuses[row.status]}
      </span>
      <select
        disabled={pending}
        aria-label={`Ubah status ${row.customerName} ${row.orderNumber}`}
        value={row.status}
        onChange={(e) => void mutate(row, "PATCH", e.target.value)}
      >
        {Object.entries(orderStatuses).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
  const actions = (row: OrderRow) => (
    <div className="order-actions">
      <Link
        className="icon-button"
        href={`/permintaan/${row.id}/edit`}
        aria-label={`Ubah permintaan ${row.customerName}`}
        title="Ubah permintaan"
      >
        <Pencil size={17} />
      </Link>
      <button
        className="icon-button danger-text"
        disabled={pending}
        aria-label={`Hapus permintaan ${row.customerName}`}
        onClick={() => {
          setError("");
          setDeleting(row);
        }}
        title="Hapus permintaan"
      >
        <Trash2 size={17} />
      </button>
    </div>
  );
  return (
    <>
      <PageHeading
        eyebrow="OPERASIONAL PERCETAKAN"
        title="Permintaan Cetak"
        description="Pantau pesanan pelanggan, dari pekerjaan baru hingga hasil cetak diambil."
        action={
          <Link className="button" href="/permintaan/baru">
            <Plus size={18} />
            Tambah permintaan
          </Link>
        }
      />
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          <button
            className="text-button"
            onClick={() => setMessage("")}
            aria-label="Tutup notifikasi"
          >
            Tutup
          </button>
        </div>
      )}
      {error && !deleting && (
        <div className="alert error order-alert" role="alert">
          {error}
        </div>
      )}
      <section className="panel order-filter-panel">
        <div className="order-filter-title">
          <SlidersHorizontal size={17} />
          <h2>Filter permintaan</h2>
          <span>Gabungkan pilihan sesuai kebutuhan</span>
        </div>
        <form onSubmit={apply}>
          <div className="order-filter-grid">
            <label className="order-search">
              Cari pelanggan / produk
              <span className="search-input">
                <Search size={17} />
                <input
                  name="q"
                  maxLength={150}
                  placeholder="Nama pelanggan, kategori, atau produk…"
                  value={draft.q}
                  onChange={(e) => setDraft({ ...draft, q: e.target.value })}
                />
              </span>
            </label>
            <label>
              Status
              <select
                name="status"
                value={draft.status}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    status: e.target.value as OrderFilters["status"],
                  })
                }
              >
                <option value="">Semua status</option>
                {Object.entries(orderStatuses).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Kategori
              <select
                name="categoryId"
                value={draft.categoryId ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    categoryId: e.target.value || undefined,
                    subcategoryId: undefined,
                  })
                }
              >
                <option value="">Semua kategori</option>
                {categories
                  .filter((r) => !r.parentId)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.isActive ? "" : " (arsip)"}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Subkategori
              <select
                name="subcategoryId"
                disabled={!draft.categoryId}
                value={draft.subcategoryId ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    subcategoryId: e.target.value || undefined,
                  })
                }
              >
                <option value="">Semua subkategori</option>
                {categories
                  .filter((r) => r.parentId === draft.categoryId)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.isActive ? "" : " (arsip)"}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Tanggal mulai
              <input
                type="date"
                name="start"
                defaultValue={filters.start ?? ""}
              />
            </label>
            <label>
              Tanggal akhir
              <input type="date" name="end" defaultValue={filters.end ?? ""} />
            </label>
            <label>
              Baris per halaman
              <select
                name="pageSize"
                value={draft.pageSize}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    pageSize: Number(
                      e.target.value,
                    ) as OrderFilters["pageSize"],
                  })
                }
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} baris
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="order-filter-actions">
            <Link className="text-button" href="/permintaan">
              Reset filter
            </Link>
            <button disabled={pending} type="submit">
              {transition ? "Memuat…" : "Terapkan filter"}
            </button>
          </div>
        </form>
      </section>
      <section className="panel orders-panel" aria-busy={pending}>
        <div className="order-results-heading">
          <div>
            <h2>
              Daftar permintaan <span className="tag">{data.total} hasil</span>
            </h2>
            <p>
              Urutan tanggal terbaru · Ekspor mengikuti filter yang sudah
              diterapkan.
            </p>
          </div>
          <div className="order-export-buttons">
            <button
              className="button secondary"
              disabled={pending}
              onClick={() => void download("xlsx")}
            >
              <Download size={16} />
              {busy === "export-xlsx" ? "Mengunduh…" : "Excel (.xlsx)"}
            </button>
            <button
              className="button secondary"
              disabled={pending}
              onClick={() => void download("csv")}
            >
              <Download size={16} />
              {busy === "export-csv" ? "Mengunduh…" : "CSV (.csv)"}
            </button>
          </div>
        </div>
        {data.rows.length ? (
          <>
            <div className="orders-desktop">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Tanggal & kode</th>
                    <th>Pelanggan</th>
                    <th>Produk / jasa</th>
                    <th>Jumlah</th>
                    <th>Total harga</th>
                    <th>Status pekerjaan</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {displayDate(row.orderDate)}
                        <small className="order-code">{row.orderNumber}</small>
                      </td>
                      <td>
                        <strong>{row.customerName}</strong>
                        {row.notes && (
                          <small
                            className="order-note-preview"
                            title={row.notes}
                          >
                            {row.notes}
                          </small>
                        )}
                      </td>
                      <td>
                        {row.productNameSnapshot}
                        {row.subcategoryId && (
                          <small>{row.categoryNameSnapshot}</small>
                        )}
                      </td>
                      <td className="nowrap">
                        {formatQuantity(row.quantity)} {row.unit}
                        <small>@ {formatRupiah(row.unitPrice)}</small>
                      </td>
                      <td className="order-total-cell">
                        {formatRupiah(row.totalPrice)}
                      </td>
                      <td>{statusControl(row)}</td>
                      <td>{actions(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="orders-mobile">
              {data.rows.map((row) => (
                <article className="order-mobile-card" key={row.id}>
                  <div className="order-mobile-title">
                    <div>
                      <strong>{row.customerName}</strong>
                      <small>{displayDate(row.orderDate)}</small>
                    </div>
                    {actions(row)}
                  </div>
                  <p className="order-code">{row.orderNumber}</p>
                  <div className="order-mobile-details">
                    <div>
                      <span>Produk / jasa</span>
                      <strong>{row.productNameSnapshot}</strong>
                      {row.subcategoryId && (
                        <small>{row.categoryNameSnapshot}</small>
                      )}
                    </div>
                    <div>
                      <span>Jumlah</span>
                      <strong>
                        {formatQuantity(row.quantity)} {row.unit}
                      </strong>
                      <small>@ {formatRupiah(row.unitPrice)}</small>
                    </div>
                  </div>
                  {row.notes && (
                    <p className="order-mobile-notes">{row.notes}</p>
                  )}
                  <div className="order-mobile-bottom">
                    <div>
                      <small>Total harga</small>
                      <strong>{formatRupiah(row.totalPrice)}</strong>
                    </div>
                    {statusControl(row)}
                  </div>
                </article>
              ))}
            </div>
            <div className="order-pagination">
              <span>
                Menampilkan {(data.page - 1) * data.pageSize + 1}–
                {Math.min(data.page * data.pageSize, data.total)} dari{" "}
                {data.total}
              </span>
              <div>
                {data.page > 1 ? (
                  <Link
                    className="button secondary"
                    href={`/permintaan?${orderQuery(filters, data.page - 1)}`}
                    aria-label="Halaman sebelumnya"
                  >
                    <ChevronLeft size={16} />
                  </Link>
                ) : (
                  <button
                    className="button secondary"
                    disabled
                    aria-label="Halaman sebelumnya"
                  >
                    <ChevronLeft size={16} />
                  </button>
                )}
                <span>
                  Halaman {data.page} / {data.totalPages}
                </span>
                {data.page < data.totalPages ? (
                  <Link
                    className="button secondary"
                    href={`/permintaan?${orderQuery(filters, data.page + 1)}`}
                    aria-label="Halaman berikutnya"
                  >
                    <ChevronRight size={16} />
                  </Link>
                ) : (
                  <button
                    className="button secondary"
                    disabled
                    aria-label="Halaman berikutnya"
                  >
                    <ChevronRight size={16} />
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <span className="icon-tile">
              <ClipboardList size={27} />
            </span>
            <h2>
              {filters.q ||
              filters.status ||
              filters.categoryId ||
              filters.start ||
              filters.end
                ? "Tidak ada permintaan yang cocok"
                : "Belum ada permintaan cetak"}
            </h2>
            <p>
              Tambahkan pesanan baru atau sesuaikan filter untuk melihat
              permintaan yang tersimpan.
            </p>
            <Link className="button secondary" href="/permintaan/baru">
              <Plus size={17} />
              Tambah permintaan
            </Link>
          </div>
        )}
      </section>
      <p className="order-footnote">
        Baru → Diproses → Selesai → Diambil · Status Diambil tidak menyatakan
        pesanan sudah lunas.
      </p>
      {deleting && (
        <Modal
          title="Hapus permintaan?"
          pending={pending}
          onClose={() => setDeleting(null)}
        >
          <p>
            Permintaan <strong>{deleting.customerName}</strong> (
            {deleting.orderNumber}) akan dihapus dari daftar aktif.
          </p>
          <p className="muted">
            Data historis tetap disimpan. Tindakan ini tidak menambah atau
            mengurangi uang kas.
          </p>
          {(deleting.incomeCount > 0 || deleting.budgetCount > 0) && (
            <div className="alert">
              Terkait {deleting.incomeCount} transaksi kas dan{" "}
              {deleting.budgetCount} budgeting. Tautan ke permintaan akan
              dilepas; data dan nominal terkait tetap tersimpan.
            </div>
          )}
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={pending}
              onClick={() => setDeleting(null)}
            >
              Batal
            </button>
            <button
              className="danger"
              disabled={pending}
              onClick={() => void mutate(deleting, "DELETE")}
            >
              {pending ? "Menghapus…" : "Ya, hapus permintaan"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function parseOrderFiltersSafe(input: unknown) {
  const parsed = filterSchema.safeParse(input);
  return parsed.success
    ? parsed.data
    : parsed.error.issues.map((i) => i.message).join(" ");
}
