import Link from "next/link";
import { requirePageAdmin } from "@/lib/auth/session";
import { PageHeading } from "@/components/page-heading";
import { getDashboard } from "@/features/cash/aggregates";
import { DashboardRefresh } from "@/features/cash/dashboard-refresh";
import { ExactDecimal, formatRupiah } from "@/lib/money";
import { displayDate } from "@/lib/date";
import {
  ClipboardList,
  Clock3,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  Plus,
  Wallet,
  ArrowRight,
} from "lucide-react";
export default async function Dashboard() {
  await requirePageAdmin();
  const data = await getDashboard(),
    f = data.finance,
    sign = new ExactDecimal(f.net).cmp(0);
  const cards = [
    {
      label: "Pesanan masuk bulan ini",
      value: String(data.orderCount),
      hint: data.period.label,
      icon: ClipboardList,
      tone: "",
    },
    {
      label: "Sedang diproses",
      value: String(data.processingCount),
      hint: "Semua tanggal · Antrean saat ini",
      icon: Clock3,
      tone: "",
    },
    {
      label: "Pemasukan bulan ini",
      value: formatRupiah(f.income),
      hint: "Uang yang benar-benar diterima",
      icon: ArrowDownLeft,
      tone: "cash-income",
    },
    {
      label: "Pengeluaran bulan ini",
      value: formatRupiah(f.expense),
      hint: "Uang yang benar-benar dibayar",
      icon: ArrowUpRight,
      tone: "cash-expense",
    },
    {
      label: "Selisih bulan ini",
      value: `${sign > 0 ? "+" : ""}${formatRupiah(f.net)}`,
      hint: sign > 0 ? "Surplus" : sign < 0 ? "Defisit" : "Seimbang",
      icon: TrendingUp,
      tone: sign > 0 ? "cash-income" : sign < 0 ? "cash-expense" : "",
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow={`RINGKASAN USAHA · ${data.period.label.toLocaleUpperCase("id-ID")} · WIB`}
        title="Gambaran usaha Anda hari ini."
        description={`Pesanan dan kas bertanggal ${displayDate(data.period.start)}–${displayDate(data.period.end)}. Antrean Diproses mencakup semua tanggal.`}
        action={
          <Link className="button" href="/buku-kas/baru">
            <Plus size={17} />
            Catat transaksi
          </Link>
        }
      />
      <DashboardRefresh generatedAt={data.generatedAt} />
      <div className="dashboard-metrics">
        {cards.map(({ label, value, hint, icon: Icon, tone }) => (
          <article className={`metric-card live-metric ${tone}`} key={label}>
            <div>
              <span>{label}</span>
              <Icon size={19} />
            </div>
            <strong>{value}</strong>
            <small>{hint}</small>
          </article>
        ))}
      </div>
      <section className="panel dashboard-balance">
        <div className="dashboard-balance-title">
          <span className="icon-tile">
            <Wallet size={23} />
          </span>
          <div>
            <h2>Posisi kas bulan ini</h2>
            <p>Saldo pembukaan dihitung terpisah dari pemasukan usaha.</p>
          </div>
        </div>
        {f.balanceStatus === "READY" ? (
          <div className="dashboard-balance-values">
            <div>
              <small>Saldo awal periode</small>
              <strong>{formatRupiah(f.openingBalance!)}</strong>
            </div>
            <ArrowRight size={20} />
            <div>
              <small>Saldo akhir periode</small>
              <strong>{formatRupiah(f.closingBalance!)}</strong>
            </div>
          </div>
        ) : (
          <div className="alert">
            {f.balanceStatus === "NOT_CONFIGURED"
              ? "Saldo kas awal belum diatur. Pemasukan dan pengeluaran sudah dihitung, tetapi saldo awal/akhir belum dapat ditampilkan."
              : `Periode dimulai sebelum tanggal pembukaan ${displayDate(f.openingDate!)}. Saldo awal/akhir tidak diasumsikan untuk periode ini.`}
            <Link className="balance-settings-link" href="/pengaturan">
              Buka pengaturan saldo awal <ArrowRight size={14} />
            </Link>
          </div>
        )}
      </section>
      {f.count === 0 && (
        <section className="panel empty-state">
          <span className="icon-tile">
            <Wallet size={26} />
          </span>
          <h2>Belum ada transaksi kas bulan ini</h2>
          <p>
            Ringkasan kas bernilai nol karena belum ada transaksi tercatat pada
            periode ini. Nilai pesanan dan estimasi HPP tidak dihitung sebagai
            kas.
          </p>
          <Link className="button secondary" href="/buku-kas/baru">
            Catat transaksi pertama
          </Link>
        </section>
      )}
      <div className="section-heading">
        <h2>Akses operasional</h2>
      </div>
      <div className="setup-grid">
        <Link className="setup-card" href="/permintaan">
          <span className="icon-tile">
            <ClipboardList size={22} />
          </span>
          <div>
            <h3>Permintaan cetak</h3>
            <p>Catat pesanan dan pantau status pekerjaan.</p>
          </div>
          <ArrowUpRight size={20} />
        </Link>
        <Link className="setup-card" href="/buku-kas">
          <span className="icon-tile peach">
            <Wallet size={22} />
          </span>
          <div>
            <h3>Buku kas</h3>
            <p>Kelola uang yang benar-benar diterima dan dibayar.</p>
          </div>
          <ArrowUpRight size={20} />
        </Link>
      </div>
      <p className="cash-footnote">
        Nominal pesanan bukan uang masuk. Estimasi HPP bukan uang keluar. Hanya
        transaksi kas aktif yang masuk ringkasan.
      </p>
    </>
  );
}
