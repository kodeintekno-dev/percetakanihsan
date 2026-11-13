"use client";
import Link from "next/link";
import { ZodError } from "zod";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  ClipboardList,
  Wallet,
  CalendarDays,
} from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { displayDate } from "@/lib/date";
import { formatRupiah, formatQuantity, ExactDecimal } from "@/lib/money";
import {
  parseReportFilters,
  reportQuery,
  expenseGroupNames,
  type ReportData,
  type IncomeReportRow,
} from "./schema";
import { reportBalanceNote } from "./format";
const months = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat("id-ID", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, i, 1)),
  ),
);
export function ReportView({ data }: { data: ReportData }) {
  const router = useRouter(),
    [transition, startTransition] = useTransition(),
    [busy, setBusy] = useState(""),
    [mode, setMode] = useState(data.period.filters.mode),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const pending = !!busy || transition,
    f = data.finance,
    netSign = new ExactDecimal(f.net).cmp(0),
    balanceNote = reportBalanceNote(f);
  function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const filters = parseReportFilters(
        Object.fromEntries(new FormData(event.currentTarget)),
      );
      startTransition(() => router.push(`/laporan?${reportQuery(filters)}`));
    } catch (error) {
      setError(
        error instanceof ZodError
          ? error.issues.map((i) => i.message).join(" ")
          : "Periksa periode laporan.",
      );
    }
  }
  async function download(format: "csv" | "xlsx") {
    setBusy(format);
    setError("");
    try {
      const response = await fetch(
        `/api/exports/reports?${reportQuery(data.period.filters)}&format=${format}&revision=${data.revision}`,
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
          ?.match(/filename="([^"]+)"/)?.[1] ?? `laporan.${format}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        `Laporan ${format.toUpperCase()} lengkap berhasil diunduh sesuai periode dan data yang ditampilkan.`,
      );
    } catch {
      setError("Laporan gagal diunduh. Periksa koneksi lalu coba kembali.");
    } finally {
      setBusy("");
    }
  }
  const quantity = (row: IncomeReportRow) => (
    <>
      <div className="report-quantities">
        {row.quantities.map((q) => (
          <span key={q.unit}>
            {formatQuantity(q.quantity)} {q.unit}
          </span>
        ))}
      </div>
      {row.unknownQuantityCount > 0 && (
        <small>
          {row.unknownQuantityCount} transaksi: kuantitas belum dicatat
        </small>
      )}
      {!row.quantities.length && !row.unknownQuantityCount && (
        <small>Kuantitas tidak tersedia</small>
      )}
    </>
  );
  const metrics = [
    {
      label: "Kas masuk",
      value: formatRupiah(f.income),
      icon: ArrowDownLeft,
      tone: "cash-income",
    },
    {
      label: "Kas keluar",
      value: formatRupiah(f.expense),
      icon: ArrowUpRight,
      tone: "cash-expense",
    },
    {
      label: "Selisih",
      value: `${netSign > 0 ? "+" : ""}${formatRupiah(f.net)}`,
      icon: TrendingUp,
      tone: netSign < 0 ? "cash-expense" : "cash-income",
    },
    {
      label: "Pesanan masuk",
      value: String(data.orderCount),
      icon: ClipboardList,
      tone: "",
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="LAPORAN USAHA"
        title="Laporan Keuangan: Kas & Penyusutan"
        description={`${data.period.label} · ${displayDate(data.period.start)}–${displayDate(data.period.end)} WIB. Kas berasal dari transaksi aktif; penyusutan dihitung dari Master Aset untuk periode yang dipilih.`}
        action={
          <div className="report-export-buttons">
            <button disabled={pending} onClick={() => void download("xlsx")}>
              <Download size={17} />
              {busy === "xlsx" ? "Mengunduh…" : "Excel (.xlsx)"}
            </button>
            <button
              className="button secondary"
              disabled={pending}
              onClick={() => void download("csv")}
            >
              <Download size={17} />
              {busy === "csv" ? "Mengunduh…" : "CSV (.csv)"}
            </button>
          </div>
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
        <div className="alert error report-alert" role="alert">
          <span>{error}</span>
          <button
            className="button secondary"
            disabled={pending}
            onClick={() => startTransition(() => router.refresh())}
          >
            <RefreshCw size={15} />
            Muat ulang laporan
          </button>
        </div>
      )}
      <section className="panel report-filter">
        <div className="report-section-heading">
          <CalendarDays size={19} />
          <h2>Periode laporan</h2>
        </div>
        <form onSubmit={apply}>
          <div className="report-filter-grid">
            <label>
              Mode periode
              <select
                name="mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
              >
                <option value="month">Bulan dan tahun</option>
                <option value="range">Rentang tanggal</option>
              </select>
            </label>
            <fieldset
              className="report-period-fields"
              disabled={mode !== "month"}
              hidden={mode !== "month"}
            >
              <legend className="sr-only">Bulan dan tahun</legend>
              <label>
                Bulan
                <select
                  name="month"
                  defaultValue={Number(data.period.start.slice(5, 7))}
                >
                  {months.map((name, i) => (
                    <option key={name} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tahun
                <input
                  name="year"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={9999}
                  required
                  defaultValue={Number(data.period.start.slice(0, 4))}
                />
              </label>
            </fieldset>
            <fieldset
              className="report-period-fields"
              disabled={mode !== "range"}
              hidden={mode !== "range"}
            >
              <legend className="sr-only">Rentang tanggal inklusif</legend>
              <label>
                Tanggal mulai
                <input
                  name="start"
                  type="date"
                  required
                  defaultValue={data.period.start}
                />
              </label>
              <label>
                Tanggal akhir
                <input
                  name="end"
                  type="date"
                  required
                  defaultValue={data.period.end}
                />
              </label>
            </fieldset>
          </div>
          <div className="order-filter-actions">
            <Link href="/laporan" className="text-button">
              Reset ke bulan berjalan
            </Link>
            <button type="submit" disabled={pending}>
              {transition ? "Memuat…" : "Terapkan periode"}
            </button>
          </div>
        </form>
      </section>
      <div className="report-updated">
        <span>
          Diperbarui{" "}
          {new Intl.DateTimeFormat("id-ID", {
            dateStyle: "medium",
            timeStyle: "medium",
            timeZone: "Asia/Jakarta",
          }).format(new Date(data.generatedAt))}{" "}
          WIB
        </span>
        <button
          type="button"
          className="button secondary"
          disabled={pending}
          onClick={() => {
            setError("");
            startTransition(() => router.refresh());
          }}
        >
          <RefreshCw size={15} />
          Perbarui laporan
        </button>
      </div>
      <div className="metric-grid report-metrics">
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <article className={`metric-card live-metric ${tone}`} key={label}>
            <div>
              <span>{label}</span>
              <Icon size={19} />
            </div>
            <strong>{value}</strong>
            <small>
              {label === "Pesanan masuk"
                ? "Berdasarkan tanggal pesanan"
                : label === "Selisih"
                  ? netSign > 0
                    ? "Surplus"
                    : netSign < 0
                      ? "Defisit"
                      : "Seimbang"
                  : "Berdasarkan tanggal transaksi"}
            </small>
          </article>
        ))}
      </div>
      {!f.count && (
        <div className="info-strip">
          <Wallet size={18} />
          <p>
            Belum ada transaksi kas pada periode ini. Nilai pesanan dan estimasi
            HPP tidak menjadi kas masuk atau keluar.
          </p>
        </div>
      )}
      {balanceNote && (
        <div className="alert report-balance-note">
          <p>{balanceNote}</p>
          <Link href="/pengaturan" className="text-button">
            Buka pengaturan saldo awal
          </Link>
        </div>
      )}
      <section className="panel report-panel" aria-labelledby="report-revenue">
        <div className="report-section-heading">
          <h2 id="report-revenue">Pendapatan per produk</h2>
          <span className="tag">
            {data.income.saleTransactionCount} transaksi penjualan
          </span>
        </div>
        <p className="report-hint">
          Transaksi adalah penerimaan kas. Pesanan tertaut dihitung unik;
          kuantitas berasal dari penerimaan ini, termasuk alokasi DP/pelunasan.
        </p>
        {data.income.legacyLabelCount > 0 && (
          <p className="alert">
            {data.income.legacyLabelCount} transaksi format lama belum memiliki
            label historis lengkap; nama master yang tersedia digunakan.
          </p>
        )}
        {data.income.sales.length ? (
          <>
            <div className="report-desktop report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Kategori / produk historis</th>
                    <th>Transaksi</th>
                    <th>Pesanan tertaut unik</th>
                    <th>Kuantitas tercatat</th>
                    <th>Kas masuk</th>
                  </tr>
                </thead>
                <tbody>
                  {data.income.sales.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <strong>{row.productName}</strong>
                        {row.categoryName !== row.productName && (
                          <small>{row.categoryName}</small>
                        )}
                      </td>
                      <td>{row.transactionCount}</td>
                      <td>{row.linkedOrderCount}</td>
                      <td>{quantity(row)}</td>
                      <td className="report-money">
                        {formatRupiah(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="report-mobile">
              {data.income.sales.map((row) => (
                <article className="report-income-card" key={row.key}>
                  <h3>{row.productName}</h3>
                  {row.categoryName !== row.productName && (
                    <p>{row.categoryName}</p>
                  )}
                  <dl>
                    <div>
                      <dt>Transaksi</dt>
                      <dd>{row.transactionCount}</dd>
                    </div>
                    <div>
                      <dt>Pesanan tertaut unik</dt>
                      <dd>{row.linkedOrderCount}</dd>
                    </div>
                    <div>
                      <dt>Kuantitas tercatat</dt>
                      <dd>{quantity(row)}</dd>
                    </div>
                  </dl>
                  <strong className="cash-income">
                    {formatRupiah(row.amount)}
                  </strong>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="report-empty">
            Belum ada penerimaan penjualan pada periode ini.
          </p>
        )}
        <div className="report-subtotal">
          <span>Total penjualan</span>
          <strong>{formatRupiah(data.income.saleAmount)}</strong>
        </div>
        <div className="report-other">
          <div>
            <h3>Pemasukan lain-lain</h3>
            <p>
              {data.income.otherTransactionCount} transaksi · Kuantitas tidak
              berlaku
            </p>
          </div>
          <strong>{formatRupiah(data.income.otherAmount)}</strong>
        </div>
        <div className="report-grand-total">
          <div>
            <strong>Total pendapatan kas</strong>
            <small>
              {data.income.saleTransactionCount +
                data.income.otherTransactionCount}{" "}
              transaksi pemasukan · {data.income.linkedOrderCount} pesanan
              tertaut unik pada penjualan
            </small>
          </div>
          <strong>{formatRupiah(f.income)}</strong>
        </div>
      </section>
      <section className="panel report-panel" aria-labelledby="report-expenses">
        <div className="report-section-heading">
          <h2 id="report-expenses">Pengeluaran menurut kelompok</h2>
        </div>
        <p className="report-hint">
          Kelompok mengikuti klasifikasi ketika transaksi dicatat. Penggantian
          kelompok pada master tidak mengubah pengelompokan historis.
        </p>
        <div className="report-expense-groups">
          {Object.entries(expenseGroupNames).map(([group, label]) => {
            const rows = data.expenses.filter((e) => e.group === group);
            return (
              <article key={group}>
                <div className="report-expense-title">
                  <h3>{label}</h3>
                  <strong>
                    {formatRupiah(
                      f.groups[group as keyof typeof expenseGroupNames],
                    )}
                  </strong>
                </div>
                {rows.length ? (
                  rows.map((row) => (
                    <div className="report-expense-row" key={row.postId}>
                      <div>
                        <strong>{row.postName}</strong>
                        <small>{row.transactionCount} transaksi</small>
                      </div>
                      <span>{formatRupiah(row.amount)}</span>
                    </div>
                  ))
                ) : (
                  <p className="report-empty">
                    Belum ada pengeluaran {label.toLocaleLowerCase("id-ID")}.
                  </p>
                )}
              </article>
            );
          })}
        </div>
        <div className="report-subtotal">
          <strong>Total pengeluaran kas</strong>
          <strong>{formatRupiah(f.expense)}</strong>
        </div>
      </section>
      <section className="panel report-panel" aria-labelledby="report-profit">
        <div className="report-section-heading">
          <h2 id="report-profit">Laba/rugi dengan penyusutan</h2>
        </div>
        <p className="report-hint">
          Pendapatan dan biaya menggunakan kas tercatat, disesuaikan pembelian
          aset tertaut dan penyusutan nonkas. Laporan ini belum merupakan
          laporan akrual penuh. Penyusutan tidak mengurangi saldo kas.
        </p>
        <dl className="report-profit">
          <div>
            <dt>Pendapatan kas</dt>
            <dd>{formatRupiah(f.income)}</dd>
          </div>
          {Object.entries(expenseGroupNames).map(([group, label]) => (
            <div key={group}>
              <dt>Beban {label.toLocaleLowerCase("id-ID")}</dt>
              <dd>
                −
                {formatRupiah(
                  f.groups[group as keyof typeof expenseGroupNames],
                )}
              </dd>
            </div>
          ))}
          <div className="report-net">
            <dt>Selisih kas sebelum penyesuaian</dt>
            <dd className={netSign < 0 ? "cash-expense" : "cash-income"}>
              {netSign > 0 ? "+" : ""}
              {formatRupiah(f.net)}
            </dd>
          </div>
          <div>
            <dt>Pembelian aset tertaut — dikeluarkan dari beban</dt>
            <dd>+{formatRupiah(data.assets.purchases)}</dd>
          </div>
          <div>
            <dt>Beban penyusutan (nonkas)</dt>
            <dd>−{formatRupiah(data.assets.depreciation)}</dd>
          </div>
          <div className="report-net">
            <dt>Laba/rugi setelah penyesuaian</dt>
            <dd
              className={
                new ExactDecimal(data.assets.adjustedNet).isNegative()
                  ? "cash-expense"
                  : "cash-income"
              }
            >
              {formatRupiah(data.assets.adjustedNet)}
            </dd>
          </div>
        </dl>
        <h3>Rincian penyusutan aset</h3>
        <p className="report-hint">
          Garis lurus, nilai sisa nol. Beban satu bulan penuh diakui pada
          tanggal akhir bulan, sejak bulan mulai digunakan. Bulan penghentian
          masih dihitung. <Link href="/aset">Kelola Master Aset</Link>.
        </p>
        {data.assets.rows.length ? (
          data.assets.rows.map((a) => (
            <div className="report-subtotal" key={a.id}>
              <span>
                {a.name}
                <small style={{ display: "block" }}>
                  Akumulasi: {formatRupiah(a.accumulated)} · Nilai buku:{" "}
                  {formatRupiah(a.bookValue)}
                </small>
              </span>
              <strong>{formatRupiah(a.amount)}</strong>
            </div>
          ))
        ) : (
          <p className="report-empty">
            Belum ada aset. Tambahkan aset di Master Aset untuk menghitung
            penyusutan.
          </p>
        )}
      </section>
      <section className="panel report-panel" aria-labelledby="report-flow">
        <div className="report-section-heading">
          <h2 id="report-flow">Arus kas</h2>
        </div>
        <div className="report-opening">
          <div>
            <small>Saldo pembukaan aplikasi</small>
            <strong>
              {data.opening
                ? formatRupiah(data.opening.amount)
                : "Belum dikonfigurasi"}
            </strong>
            <p>
              {data.opening
                ? `Efektif ${displayDate(data.opening.date)}`
                : "Tanggal efektif belum ditetapkan"}{" "}
              · Terpisah dari pendapatan
            </p>
          </div>
          <Link className="text-button" href="/pengaturan">
            Pengaturan kas
          </Link>
        </div>
        <dl className="report-cash-flow">
          <div>
            <dt>Saldo awal periode</dt>
            <dd>
              {f.openingBalance !== null
                ? formatRupiah(f.openingBalance)
                : "Belum dapat dihitung"}
            </dd>
          </div>
          <div>
            <dt>Kas masuk periode</dt>
            <dd className="cash-income">+{formatRupiah(f.income)}</dd>
          </div>
          <div>
            <dt>Kas keluar periode</dt>
            <dd className="cash-expense">−{formatRupiah(f.expense)}</dd>
          </div>
          <div className="report-net">
            <dt>Saldo akhir periode</dt>
            <dd>
              {f.closingBalance !== null
                ? formatRupiah(f.closingBalance)
                : "Belum dapat dihitung"}
            </dd>
          </div>
        </dl>
        <h3 className="report-daily-title">Rincian harian</h3>
        <p className="report-hint">
          Hanya tanggal dengan transaksi aktif. Saldo berantai mencakup
          transaksi sejak tanggal efektif pembukaan.
        </p>
        {data.daily.length ? (
          <div
            className="report-table-wrap"
            role="region"
            aria-label="Tabel arus kas harian; geser untuk melihat seluruh kolom"
            tabIndex={0}
          >
            <table className="report-table report-daily">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Kas masuk</th>
                  <th>Kas keluar</th>
                  <th>Selisih</th>
                  <th>Saldo awal</th>
                  <th>Saldo akhir</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.map((day) => (
                  <tr key={day.date}>
                    <td>{displayDate(day.date)}</td>
                    <td>{formatRupiah(day.income)}</td>
                    <td>{formatRupiah(day.expense)}</td>
                    <td>{formatRupiah(day.net)}</td>
                    <td>
                      {day.openingBalance !== null
                        ? formatRupiah(day.openingBalance)
                        : "Belum dihitung"}
                    </td>
                    <td>
                      {day.closingBalance !== null
                        ? formatRupiah(day.closingBalance)
                        : "Belum dihitung"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="report-empty">
            Tidak ada transaksi harian pada periode ini.
          </p>
        )}
      </section>
      <section className="panel report-panel" aria-labelledby="report-posts">
        <div className="report-section-heading">
          <h2 id="report-posts">Analitik pengeluaran per pos</h2>
          <span className="tag">Terbesar ke terkecil</span>
        </div>
        <p className="report-hint">
          Persentase dari total pengeluaran {formatRupiah(f.expense)}.
          Persentase dibulatkan dua desimal.
        </p>
        {data.posts.length ? (
          <div className="report-posts">
            {data.posts.map((post) => (
              <article key={post.postId}>
                <div className="report-post-heading">
                  <div>
                    <strong>{post.postName}</strong>
                    <small>
                      {post.groups.map((g) => expenseGroupNames[g]).join(" / ")}{" "}
                      · {post.transactionCount} transaksi
                    </small>
                  </div>
                  <div>
                    <strong>{formatRupiah(post.amount)}</strong>
                    <span>{post.percent.replace(".", ",")}%</span>
                  </div>
                </div>
                <progress
                  max={100}
                  value={Number(post.percent)}
                  aria-label={`${post.postName}: ${post.percent.replace(".", ",")}% dari pengeluaran`}
                />
              </article>
            ))}
          </div>
        ) : (
          <p className="report-empty">
            Belum ada pengeluaran. Persentase 0%; tidak ada pembagian dengan
            nol.
          </p>
        )}
      </section>
      <p className="report-hint">
        Ekspor Excel mencakup Ringkasan, Pendapatan, Pengeluaran, Arus Kas,
        Analitik Pos, dan Penyusutan. CSV menyimpan seluruh bagian dalam tabel
        terstruktur.
      </p>
    </>
  );
}
