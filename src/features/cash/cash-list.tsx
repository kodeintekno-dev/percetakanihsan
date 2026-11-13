"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Plus,
  Download,
  Pencil,
  Trash2,
  Wallet,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Modal } from "@/components/modal";
import type { ExpenseRow } from "@/features/expenses/schema";
import { expenseGroups } from "@/features/expenses/schema";
import {
  cashFilterSchema,
  cashQuery,
  cashTypes,
  incomeKinds,
  type CashFilters,
  type CashPage,
  type CashRow,
} from "./schema";
import { displayDate } from "@/lib/date";
import { ExactDecimal, formatQuantity, formatRupiah } from "@/lib/money";
import { notifyDataChanged } from "@/lib/notify-data-changed";

export function CashList({
  data,
  posts,
  filters,
  notice,
}: {
  data: CashPage;
  posts: ExpenseRow[];
  filters: CashFilters;
  notice?: string;
}) {
  const router = useRouter(),
    [transition, startTransition] = useTransition();
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState<CashRow | null>(null);
  const [message, setMessage] = useState(
    notice === "created"
      ? "Transaksi kas berhasil dicatat."
      : notice === "updated"
        ? "Transaksi kas berhasil diperbarui."
        : notice === "replayed"
          ? "Transaksi sudah tercatat. Permintaan ulang tidak membuat pencatatan ganda."
          : "",
  );
  const pending = !!busy || transition;
  function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsed = cashFilterSchema.safeParse({
      ...Object.fromEntries(new FormData(event.currentTarget)),
      page: 1,
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    startTransition(() =>
      router.push(`/buku-kas?${cashQuery(parsed.data, 1)}`),
    );
  }
  async function remove() {
    if (!deleting) return;
    setBusy(deleting.id);
    setError("");
    try {
      const response = await fetch(`/api/cash-transactions/${deleting.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updatedAt: deleting.updatedAt }),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        setError(result.error);
        return;
      }
      setDeleting(null);
      setMessage("Transaksi dihapus dari buku kas dan perhitungan saldo.");
      notifyDataChanged();
      startTransition(() => router.refresh());
    } catch {
      setError("Koneksi terputus. Muat ulang daftar sebelum mencoba kembali.");
    } finally {
      setBusy("");
    }
  }
  async function download(format: "csv" | "xlsx") {
    setBusy(`export-${format}`);
    setError("");
    try {
      const response = await fetch(
        `/api/exports/cash?${cashQuery(filters)}&format=${format}`,
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
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? `buku-kas.${format}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        `Ekspor ${format.toUpperCase()} selesai: ${response.headers.get("X-Export-Row-Count") ?? "seluruh"} transaksi sesuai filter aktif.`,
      );
    } catch {
      setError("Ekspor gagal diunduh. Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy("");
    }
  }
  const actions = (row: CashRow) => (
    <div className="order-actions">
      <Link
        className="icon-button"
        href={`/buku-kas/${row.id}/edit`}
        aria-label={`Ubah transaksi ${row.description}`}
        title="Ubah transaksi"
      >
        <Pencil size={17} />
      </Link>
      <button
        className="icon-button danger-text"
        disabled={pending}
        aria-label={`Hapus transaksi ${row.description}`}
        title="Hapus transaksi"
        onClick={() => {
          setError("");
          setDeleting(row);
        }}
      >
        <Trash2 size={17} />
      </button>
    </div>
  );
  const detail = (row: CashRow) => (
    <div className="cash-row-detail">
      {row.type === "EXPENSE" ? (
        <>
          <strong>{row.expensePostName}</strong>
          <small>
            {row.expenseGroupSnapshot &&
              expenseGroups[row.expenseGroupSnapshot]}{" "}
            · Kelompok saat dicatat
          </small>
        </>
      ) : (
        <>
          <strong>{row.incomeKind && incomeKinds[row.incomeKind]}</strong>
          {row.incomeKind === "SALE" && (
            <>
              <small>
                {row.productNameSnapshot}
                {row.subcategoryId ? ` · ${row.categoryNameSnapshot}` : ""}
              </small>
              <small>
                {row.soldQuantity === null
                  ? "Kuantitas belum dicatat"
                  : `${formatQuantity(row.soldQuantity)} ${row.soldUnit} terjual`}
              </small>
            </>
          )}
        </>
      )}
      {row.orderId && (
        <Link
          className="cash-order-link"
          href={`/permintaan/${row.orderId}/edit`}
        >
          {row.orderNumber} · {row.orderCustomerName}
        </Link>
      )}
    </div>
  );
  const money = (row: CashRow) => (
    <strong className={row.type === "INCOME" ? "cash-income" : "cash-expense"}>
      {row.type === "INCOME" ? "+" : "−"}
      {formatRupiah(row.amount)}
    </strong>
  );
  const netSign = new ExactDecimal(data.totals.net).cmp(0);
  return (
    <>
      <PageHeading
        eyebrow="KEUANGAN USAHA"
        title="Buku Kas"
        description="Catat uang yang benar-benar diterima dan dibayar. Pesanan dan estimasi HPP tidak otomatis menjadi transaksi kas."
        action={
          <Link className="button" href="/buku-kas/baru">
            <Plus size={18} />
            Catat transaksi
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
      {error && !deleting && (
        <div className="alert error order-alert" role="alert">
          {error}
        </div>
      )}
      <section className="panel order-filter-panel">
        <div className="order-filter-title">
          <SlidersHorizontal size={17} />
          <h2>Filter buku kas</h2>
          <span>Gabungkan jenis, pos, tanggal, dan keterangan</span>
        </div>
        <form onSubmit={apply}>
          <div className="order-filter-grid cash-filter-grid">
            <label className="order-search">
              Cari keterangan
              <input
                name="q"
                defaultValue={filters.q}
                maxLength={150}
                placeholder="Keterangan transaksi…"
              />
            </label>
            <label>
              Jenis
              <select name="type" defaultValue={filters.type}>
                <option value="">Semua jenis</option>
                {Object.entries(cashTypes).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pos pengeluaran
              <select
                name="expensePostId"
                defaultValue={filters.expensePostId ?? ""}
              >
                <option value="">Semua pos</option>
                {posts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.isActive ? "" : " (arsip)"}
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
            <Link className="text-button" href="/buku-kas">
              Reset filter
            </Link>
            <button disabled={pending} type="submit">
              {transition ? "Memuat…" : "Terapkan filter"}
            </button>
          </div>
        </form>
      </section>
      <div className="cash-totals" aria-label="Ringkasan seluruh hasil filter">
        {[
          {
            label: "Pemasukan",
            value: data.totals.income,
            tone: "cash-income",
          },
          {
            label: "Pengeluaran",
            value: data.totals.expense,
            tone: "cash-expense",
          },
          {
            label: "Selisih",
            value: data.totals.net,
            tone: netSign < 0 ? "cash-expense" : "cash-income",
          },
        ].map((c) => (
          <article className="metric-card live-metric" key={c.label}>
            <div>
              <span>{c.label}</span>
            </div>
            <strong className={c.tone}>
              {c.label === "Selisih" && netSign > 0 ? "+" : ""}
              {formatRupiah(c.value)}
            </strong>
            <small>
              Seluruh {data.total} transaksi sesuai filter, bukan hanya halaman
              ini
            </small>
          </article>
        ))}
      </div>
      <section className="panel orders-panel" aria-busy={pending}>
        <div className="order-results-heading">
          <div>
            <h2>
              Daftar transaksi <span className="tag">{data.total} hasil</span>
            </h2>
            <p>
              Urutan tanggal terbaru · Ekspor mencakup seluruh filter yang
              diterapkan.
            </p>
          </div>
          <div className="order-export-buttons">
            {(["xlsx", "csv"] as const).map((format) => (
              <button
                key={format}
                className="button secondary"
                disabled={pending}
                onClick={() => void download(format)}
              >
                <Download size={16} />
                {busy === `export-${format}`
                  ? "Mengunduh…"
                  : format === "xlsx"
                    ? "Excel (.xlsx)"
                    : "CSV (.csv)"}
              </button>
            ))}
          </div>
        </div>
        {data.rows.length ? (
          <>
            <div className="orders-desktop">
              <table className="orders-table cash-table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Keterangan</th>
                    <th>Jenis & rincian</th>
                    <th>Jumlah</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="nowrap">
                        {displayDate(row.transactionDate)}
                        <small className="order-code">
                          {row.id.slice(-8).toUpperCase()}
                        </small>
                      </td>
                      <td className="cash-description">{row.description}</td>
                      <td>
                        <span
                          className={`tag ${row.type === "INCOME" ? "active-tag" : "archive-tag"}`}
                        >
                          {cashTypes[row.type]}
                        </span>
                        {detail(row)}
                      </td>
                      <td className="nowrap">{money(row)}</td>
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
                      <span className="tag">{cashTypes[row.type]}</span>
                      <small>{displayDate(row.transactionDate)}</small>
                    </div>
                    {actions(row)}
                  </div>
                  <p className="cash-description">{row.description}</p>
                  {detail(row)}
                  <div className="cash-mobile-amount">{money(row)}</div>
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
                    href={`/buku-kas?${cashQuery(filters, data.page - 1)}`}
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
                    href={`/buku-kas?${cashQuery(filters, data.page + 1)}`}
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
              <Wallet size={26} />
            </span>
            <h2>
              {filters.q ||
              filters.type ||
              filters.expensePostId ||
              filters.start ||
              filters.end
                ? "Tidak ada transaksi yang cocok"
                : "Belum ada transaksi kas"}
            </h2>
            <p>
              Catat penerimaan atau pembayaran yang nyata, atau sesuaikan
              filter.
            </p>
            <Link className="button secondary" href="/buku-kas/baru">
              <Plus size={17} />
              Catat transaksi
            </Link>
          </div>
        )}
      </section>
      <p className="cash-footnote">
        Ringkasan ini menunjukkan arus kas sesuai filter. Saldo awal dan saldo
        akhir periode dihitung terpisah di dashboard.{" "}
        <Link href="/pengaturan">Atur saldo kas awal</Link>.
      </p>
      {deleting && (
        <Modal
          title="Hapus transaksi kas?"
          pending={pending}
          onClose={() => setDeleting(null)}
        >
          <p>
            <strong>{deleting.description}</strong>
          </p>
          <p>
            {cashTypes[deleting.type]} · {formatRupiah(deleting.amount)} ·{" "}
            {displayDate(deleting.transactionDate)}
          </p>
          <div className="alert">
            Transaksi dihapus dari daftar aktif dan perhitungan saldo. Histori
            tetap tersimpan. Pesanan terkait tidak dihapus.
          </div>
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
              className="button danger"
              disabled={pending}
              onClick={() => void remove()}
            >
              {pending ? "Menghapus…" : "Ya, hapus transaksi"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
