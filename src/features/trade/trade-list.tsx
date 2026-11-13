import Link from "next/link";
import { Plus, ArrowUpRight, Search } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { displayDate } from "@/lib/date";
import { formatRupiah } from "@/lib/money";
import {
  tradeKinds,
  tradeStatuses,
  type InvoicePage,
  type TradeFilters,
  type InvoiceRow,
} from "./schema";
import "./trade.css";
import { TradeExportButtons } from "./export-buttons";
export function InvoiceStatus({
  row,
}: {
  row: Pick<InvoiceRow, "status" | "overdue">;
}) {
  return (
    <div className="trade-status">
      <span className={`trade-badge trade-${row.status.toLowerCase()}`}>
        {tradeStatuses[row.status]}
      </span>
      {row.overdue && (
        <span className="trade-badge trade-overdue">Lewat jatuh tempo</span>
      )}
    </div>
  );
}
export function TradeList({
  data,
  filters,
}: {
  data: InvoicePage;
  filters: TradeFilters;
}) {
  const ar = filters.kind === "RECEIVABLE",
    label = ar ? "piutang" : "hutang";
  const url = (page: number) =>
    `/hutang-piutang?${new URLSearchParams({ ...filters, page: String(page) })}`;
  return (
    <div className="trade-page">
      <PageHeading
        eyebrow="KEUANGAN USAHA"
        title="Hutang-Piutang"
        description="Pantau tagihan pelanggan dan kewajiban ke pemasok. Pembayaran terhubung langsung ke Buku Kas."
      />
      <nav className="trade-tabs" aria-label="Jenis tagihan">
        {Object.entries(tradeKinds).map(([key, title]) => (
          <Link
            key={key}
            href={`/hutang-piutang?kind=${key}`}
            aria-current={filters.kind === key ? "page" : undefined}
          >
            {title}
          </Link>
        ))}
      </nav>
      <TradeExportButtons filters={filters} />
      <div className="trade-stats">
        <div>
          <span>Sisa {label}</span>
          <strong>{formatRupiah(data.summary.remaining)}</strong>
          <small>{data.summary.openCount} tagihan belum lunas</small>
        </div>
        <div>
          <span>Lewat jatuh tempo</span>
          <strong>{formatRupiah(data.summary.overdue)}</strong>
          <small>Per {displayDate(data.today)}</small>
        </div>
        <div>
          <span>Jatuh tempo 7 hari ke depan</span>
          <strong>{formatRupiah(data.summary.dueSoon)}</strong>
          <small>Termasuk hari ini</small>
        </div>
      </div>
      <div className="trade-toolbar">
        <div>
          <h2>Daftar {label}</h2>
          <p>
            {ar
              ? "Tagihan pelanggan dari pesanan cetak."
              : "Tagihan pembelian bahan dan jasa pemasok."}
          </p>
        </div>
        <Link
          className="button"
          href={`/hutang-piutang/baru?kind=${filters.kind}`}
        >
          <Plus size={17} />
          Tambah {label}
        </Link>
      </div>
      <form className="trade-filters" action="/hutang-piutang">
        <input type="hidden" name="kind" value={filters.kind} />
        <label>
          Cari tagihan
          <input
            name="q"
            defaultValue={filters.q}
            maxLength={150}
            placeholder="Nomor, nama, atau pesanan"
          />
        </label>
        <label>
          Status
          <select name="status" defaultValue={filters.status}>
            <option value="">Semua aktif</option>
            {Object.entries(tradeStatuses).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="button secondary">
          <Search size={16} />
          Tampilkan
        </button>
      </form>
      <p className="trade-help">
        Ringkasan mengikuti jenis dan pencarian, mencakup seluruh status tagihan
        aktif.
      </p>
      {data.rows.length ? (
        <div className="trade-table-wrap">
          <table className="trade-table">
            <thead>
              <tr>
                <th>Tagihan / {ar ? "pelanggan" : "pemasok"}</th>
                <th>Total</th>
                <th>Dibayar</th>
                <th>Sisa</th>
                <th>Jatuh tempo</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Aksi</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.reference}</strong>
                    <span>{r.partyName}</span>
                    <small>{r.orderNumber ?? "Tanpa pesanan tertaut"}</small>
                  </td>
                  <td data-label="Total" className="trade-money">
                    {formatRupiah(r.amount)}
                  </td>
                  <td data-label="Dibayar" className="trade-money">
                    {formatRupiah(r.paidAmount)}
                  </td>
                  <td data-label="Sisa" className="trade-money">
                    <strong>{formatRupiah(r.remaining)}</strong>
                  </td>
                  <td data-label="Jatuh tempo">{displayDate(r.dueDate)}</td>
                  <td data-label="Status">
                    <InvoiceStatus row={r} />
                  </td>
                  <td>
                    <Link
                      className="trade-detail-link"
                      href={`/hutang-piutang/${r.id}`}
                    >
                      Detail <ArrowUpRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="trade-empty">
          <h2>Belum ada tagihan yang sesuai</h2>
          <p>Tambahkan {label} baru atau sesuaikan pencarian dan status.</p>
        </div>
      )}
      <div className="trade-pagination">
        <span>
          {data.total} tagihan · Halaman {data.page} dari {data.totalPages}
        </span>
        <div>
          {data.page > 1 && (
            <Link className="button secondary" href={url(data.page - 1)}>
              Sebelumnya
            </Link>
          )}
          {data.page < data.totalPages && (
            <Link className="button secondary" href={url(data.page + 1)}>
              Berikutnya
            </Link>
          )}
        </div>
      </div>
      <p className="trade-help">
        Membuat tagihan tidak mengubah saldo kas. Pembayaran baru otomatis masuk
        Buku Kas; DP lama dapat ditautkan dari detail tagihan.
      </p>
    </div>
  );
}
