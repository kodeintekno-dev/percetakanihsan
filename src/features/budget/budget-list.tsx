"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Calculator,
  Pencil,
  Eye,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import type { CategoryRow } from "@/features/categories/schema";
import {
  budgetFilterSchema,
  budgetQuery,
  type BudgetPage,
  type BudgetFilters,
  type BudgetSummary,
} from "./schema";
import { formatQuantity, formatRupiah } from "@/lib/money";
import { displayInstant } from "./format";
import { BudgetDeleteButton } from "./budget-delete";
export function BudgetList({
  data,
  categories,
  filters,
  notice,
}: {
  data: BudgetPage;
  categories: CategoryRow[];
  filters: BudgetFilters;
  notice?: string;
}) {
  const router = useRouter(),
    [pending, startTransition] = useTransition(),
    [error, setError] = useState(""),
    [cat, setCat] = useState(filters.categoryId ?? ""),
    [sub, setSub] = useState(filters.subcategoryId ?? ""),
    [message, setMessage] = useState(
      notice === "deleted"
        ? "Estimasi dihapus dari riwayat aktif. Kas tidak berubah."
        : "",
    );
  function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = budgetFilterSchema.safeParse({
      ...Object.fromEntries(new FormData(event.currentTarget)),
      page: 1,
    });
    setError("");
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    startTransition(() =>
      router.push(`/budgeting?${budgetQuery(parsed.data, 1)}`),
    );
  }
  const actions = (row: BudgetSummary) => (
    <div className="order-actions">
      <Link
        className="icon-button"
        href={`/budgeting/${row.id}`}
        aria-label={`Lihat estimasi ${row.title}`}
      >
        <Eye size={17} />
      </Link>
      <Link
        className="icon-button"
        href={`/budgeting/${row.id}/edit`}
        aria-label={`Ubah estimasi ${row.title}`}
      >
        <Pencil size={17} />
      </Link>
      <BudgetDeleteButton budget={row} iconOnly />
    </div>
  );
  return (
    <>
      <PageHeading
        eyebrow="PERENCANAAN PRODUKSI"
        title="Budgeting HPP"
        description="Riwayat estimasi biaya produksi dan pola potong kertas. Nilai estimasi tidak masuk perhitungan kas."
        action={
          <Link className="button" href="/budgeting/baru">
            <Plus size={18} />
            Buat estimasi
          </Link>
        }
      />
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          <button className="text-button" onClick={() => setMessage("")}>
            Tutup
          </button>
        </div>
      )}
      {error && (
        <div className="alert error order-alert" role="alert">
          {error}
        </div>
      )}
      <section className="panel order-filter-panel">
        <div className="order-filter-title">
          <SlidersHorizontal size={17} />
          <h2>Filter riwayat</h2>
          <span>Tanggal berdasarkan waktu estimasi dibuat (WIB)</span>
        </div>
        <form onSubmit={apply}>
          <div className="order-filter-grid budget-filter-grid">
            <label>
              Cari estimasi
              <input
                name="q"
                defaultValue={filters.q}
                maxLength={150}
                placeholder="Judul, produk, pelanggan atau kode…"
              />
            </label>
            <label>
              Kategori
              <select
                name="categoryId"
                value={cat}
                onChange={(e) => {
                  setCat(e.target.value);
                  setSub("");
                }}
              >
                <option value="">Semua kategori</option>
                {categories
                  .filter((c) => !c.parentId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.isActive ? "" : " (arsip)"}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Subkategori
              <select
                name="subcategoryId"
                value={sub}
                disabled={!cat}
                onChange={(e) => setSub(e.target.value)}
              >
                <option value="">Semua subkategori</option>
                {categories
                  .filter((c) => c.parentId === cat)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.isActive ? "" : " (arsip)"}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Tanggal mulai dibuat
              <input
                type="date"
                name="start"
                defaultValue={filters.start ?? ""}
              />
            </label>
            <label>
              Tanggal akhir dibuat
              <input type="date" name="end" defaultValue={filters.end ?? ""} />
            </label>
            <label>
              Baris per halaman
              <select name="pageSize" defaultValue={filters.pageSize}>
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} baris
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="order-filter-actions">
            <Link href="/budgeting" className="text-button">
              Reset filter
            </Link>
            <button type="submit" disabled={pending}>
              {pending ? "Memuat…" : "Terapkan filter"}
            </button>
          </div>
        </form>
      </section>
      <section className="panel orders-panel" aria-busy={pending}>
        <div className="order-results-heading">
          <div>
            <h2>
              Riwayat estimasi <span className="tag">{data.total} hasil</span>
            </h2>
            <p>
              Buka detail untuk melihat seluruh komponen dan snapshot hasil
              potong.
            </p>
          </div>
        </div>
        {data.rows.length ? (
          <>
            <div className="orders-desktop">
              <table className="orders-table budget-table">
                <thead>
                  <tr>
                    <th>Estimasi & waktu dibuat</th>
                    <th>Produk / pesanan</th>
                    <th>Jumlah</th>
                    <th>Total HPP</th>
                    <th>Rekomendasi jual</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/budgeting/${row.id}`}>
                          <strong>{row.title}</strong>
                        </Link>
                        <small className="order-code">{row.budgetNumber}</small>
                        <small>{displayInstant(row.createdAt)}</small>
                      </td>
                      <td>
                        {row.productNameSnapshot ?? "Kategori belum tersedia"}
                        <small>{row.categoryNameSnapshot}</small>
                        {row.orderNumberSnapshot && (
                          <small>
                            {row.customerNameSnapshot} ·{" "}
                            {row.orderNumberSnapshot}
                          </small>
                        )}
                      </td>
                      <td>
                        {formatQuantity(row.quantity)} {row.unit}
                        <small>{row.costCount} komponen biaya</small>
                      </td>
                      <td className="nowrap">{formatRupiah(row.totalHpp)}</td>
                      <td className="nowrap">
                        {formatRupiah(row.suggestedSellingTotal)}
                      </td>
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
                      <Link href={`/budgeting/${row.id}`}>
                        <strong>{row.title}</strong>
                      </Link>
                      <small>{displayInstant(row.createdAt)}</small>
                    </div>
                    {actions(row)}
                  </div>
                  <p className="order-code">{row.budgetNumber}</p>
                  <p className="budget-hint">
                    {row.productNameSnapshot} · {formatQuantity(row.quantity)}{" "}
                    {row.unit}
                  </p>
                  {row.customerNameSnapshot && (
                    <p className="budget-hint">
                      {row.customerNameSnapshot} · {row.orderNumberSnapshot}
                    </p>
                  )}
                  <div className="order-mobile-details">
                    <div>
                      <span>Total HPP</span>
                      <strong>{formatRupiah(row.totalHpp)}</strong>
                      <small>{row.costCount} komponen</small>
                    </div>
                    <div>
                      <span>Rekomendasi jual</span>
                      <strong>{formatRupiah(row.suggestedSellingTotal)}</strong>
                    </div>
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
                    aria-label="Halaman sebelumnya"
                    href={`/budgeting?${budgetQuery(filters, data.page - 1)}`}
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
                    aria-label="Halaman berikutnya"
                    href={`/budgeting?${budgetQuery(filters, data.page + 1)}`}
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
              <Calculator size={27} />
            </span>
            <h2>
              {filters.q || filters.categoryId || filters.start || filters.end
                ? "Tidak ada estimasi yang cocok"
                : "Belum ada estimasi HPP"}
            </h2>
            <p>
              Buat estimasi pertama untuk menghitung biaya produksi dan
              membandingkan pola potong.
            </p>
            <Link className="button secondary" href="/budgeting/baru">
              Buat estimasi
            </Link>
          </div>
        )}
      </section>
      <div className="info-strip">
        <p>
          Budgeting adalah perencanaan. Mencatat, mengubah, atau menghapus
          estimasi tidak membuat transaksi kas dan tidak mengubah nominal
          pesanan.
        </p>
      </div>
    </>
  );
}
