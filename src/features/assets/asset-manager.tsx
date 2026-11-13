"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { formatRupiah } from "@/lib/money";
import { displayDate, monthRange } from "@/lib/date";
import { assetDepreciation } from "./depreciation";
import type { AssetRow } from "./schema";
import "./assets.css";
export function AssetManager({
  initial,
  today,
}: {
  initial: AssetRow[];
  today: string;
}) {
  const router = useRouter(),
    key = useRef<string | null>(null);
  const [editing, setEditing] = useState<AssetRow | null>(null),
    [name, setName] = useState(""),
    [cost, setCost] = useState(""),
    [date, setDate] = useState(today),
    [months, setMonths] = useState("48"),
    [purchase, setPurchase] = useState("");
  const [q, setQ] = useState(""),
    [options, setOptions] = useState<
      { id: string; description: string; amount: string }[]
    >([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const period = monthRange(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)),
  );
  function reset() {
    setEditing(null);
    setName("");
    setCost("");
    setDate(today);
    setMonths("48");
    setPurchase("");
    setOptions([]);
    key.current = null;
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      key.current ??= crypto.randomUUID();
      const response = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing?.id ?? key.current,
          name,
          acquisitionCost: cost,
          startDate: date,
          usefulMonths: months,
          purchaseCashId: purchase || null,
          ...(editing ? { updatedAt: editing.updatedAt } : {}),
        }),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        setError(
          [result.error, ...Object.values(result.fields ?? {}).flat()].join(
            " ",
          ),
        );
        return;
      }
      reset();
      setNotice("Aset berhasil disimpan. Buku Kas tidak berubah.");
      router.refresh();
    } catch {
      setError(
        "Koneksi terputus. Coba simpan kembali; aset yang sama tidak akan ditambahkan dua kali.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function searchPurchases() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `/api/assets/purchases?${new URLSearchParams({ q })}`,
      );
      if (r.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await r.json();
      if (!r.ok) {
        setError(data.error);
        return;
      }
      setOptions(data);
    } catch {
      setError("Transaksi belum dapat dimuat.");
    } finally {
      setBusy(false);
    }
  }
  async function stop(
    event: React.FormEvent<HTMLFormElement>,
    asset: AssetRow,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stopDate: form.get("stopDate") || null,
          updatedAt: asset.updatedAt,
        }),
      });
      const data = await r.json();
      if (r.status === 401) {
        router.replace("/login");
        return;
      }
      if (!r.ok) {
        setError(data.error);
        return;
      }
      setNotice("Tanggal penghentian diperbarui. Riwayat aset tetap disimpan.");
      router.refresh();
    } catch {
      setError("Perubahan belum dapat disimpan.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="MASTER & PENGATURAN"
        title="Aset & Penyusutan"
        description="Catat aset usaha dan hitung biaya pemakaiannya setiap bulan, tanpa membuat pengeluaran kas otomatis."
      />
      <div className="alert asset-guidance">
        Metode garis lurus, nilai sisa nol. Satu bulan penuh dihitung pada akhir
        bulan mulai aset siap digunakan. Bulan terakhir digunakan masih
        dihitung. <Link href="/laporan">Lihat laporan keuangan</Link>.
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert" role="status">
          {notice}
        </div>
      )}
      <form className="panel order-form asset-form" onSubmit={submit}>
        <h2>{editing ? "Koreksi aset" : "Tambah aset"}</h2>
        {editing && (
          <p className="alert">
            Koreksi akan menghitung ulang laporan periode terkait. Pastikan
            harga, tanggal, dan masa pakai sesuai bukti pembelian.
          </p>
        )}
        <div className="form-columns">
          <label>
            Nama aset
            <input
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Mesin cetak digital"
            />
          </label>
          <label>
            Harga perolehan (Rp)
            <input
              required
              inputMode="numeric"
              pattern="[1-9][0-9]{0,17}"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="Contoh: 24000000"
            />
          </label>
          <label>
            Mulai siap digunakan
            <input
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Masa pakai (bulan)
            <input
              required
              type="number"
              min={1}
              max={1200}
              value={months}
              onChange={(e) => setMonths(e.target.value)}
            />
          </label>
        </div>
        <p className="asset-hint">
          Contoh: 4 tahun = 48 bulan. Total penyusutan dibatasi sebesar harga
          perolehan; selisih pembulatan disesuaikan otomatis.
        </p>
        <fieldset disabled={busy} className="asset-purchase">
          <legend>Transaksi pembelian di Buku Kas (opsional)</legend>
          <p>
            Aset lama yang dibeli sebelum penggunaan aplikasi dapat dikosongkan.
            Untuk pembelian yang sudah dicatat di Buku Kas, tautkan
            pengeluarannya agar tidak dihitung dua kali sebagai beban. Satu
            transaksi untuk satu aset, dengan nominal yang sama.
          </p>
          <div className="asset-search">
            <input
              aria-label="Cari transaksi pembelian"
              value={q}
              maxLength={150}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void searchPurchases();
                }
              }}
              placeholder="Cari keterangan pengeluaran"
            />
            <button
              type="button"
              className="button secondary"
              onClick={() => void searchPurchases()}
            >
              Cari transaksi
            </button>
          </div>
          <label>
            Pengeluaran pembelian
            <select
              value={purchase}
              onChange={(e) => {
                setPurchase(e.target.value);
                const row = options.find((o) => o.id === e.target.value);
                if (row) setCost(row.amount);
              }}
            >
              <option value="">Tanpa tautan transaksi kas</option>
              {purchase && !options.some((o) => o.id === purchase) && (
                <option value={purchase}>Transaksi pembelian tersimpan</option>
              )}
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.description} · {formatRupiah(o.amount)}
                </option>
              ))}
            </select>
          </label>
          <small>
            Hasil pencarian menampilkan maksimal 20 transaksi terbaru yang belum
            ditautkan. Persempit keterangan jika transaksi belum terlihat.
          </small>
        </fieldset>
        <div className="asset-actions">
          {editing && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={reset}
            >
              Batal koreksi
            </button>
          )}
          <button disabled={busy}>{busy ? "Menyimpan…" : "Simpan aset"}</button>
        </div>
      </form>
      <div className="asset-list-heading">
        <h2>
          Daftar aset <small>({initial.length})</small>
        </h2>
        <span>Prakiraan akhir bulan {today.slice(0, 7)}</span>
      </div>
      {!initial.length && (
        <div className="panel asset-form">
          <h3>Belum ada aset</h3>
          <p>
            Tambahkan mesin atau peralatan usaha melalui formulir di atas.
            Penyusutan akan muncul di laporan sesuai periode penggunaannya.
          </p>
        </div>
      )}
      <div className="asset-grid">
        {initial.map((a) => {
          const d = assetDepreciation(a, period.start, period.end);
          return (
            <article className="panel asset-card" key={a.id}>
              <div className="asset-card-heading">
                <h3>{a.name}</h3>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setEditing(a);
                    setName(a.name);
                    setCost(a.acquisitionCost);
                    setDate(a.startDate);
                    setMonths(String(a.usefulMonths));
                    setPurchase(a.purchaseCashId ?? "");
                    setOptions([]);
                    setNotice("");
                    document
                      .querySelector<HTMLFormElement>(".asset-form")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  Koreksi
                </button>
              </div>
              <p>
                {displayDate(a.startDate)} · {a.usefulMonths} bulan
                {a.stopDate
                  ? ` · Terakhir dipakai ${displayDate(a.stopDate)}`
                  : ""}
              </p>
              <dl>
                <div>
                  <dt>Harga perolehan</dt>
                  <dd>{formatRupiah(a.acquisitionCost)}</dd>
                </div>
                <div>
                  <dt>Penyusutan bulan ini</dt>
                  <dd>{formatRupiah(d.amount)}</dd>
                </div>
                <div>
                  <dt>Akumulasi akhir bulan</dt>
                  <dd>{formatRupiah(d.accumulated)}</dd>
                </div>
                <div>
                  <dt>Nilai buku akhir bulan</dt>
                  <dd>{formatRupiah(d.bookValue)}</dd>
                </div>
              </dl>
              <form onSubmit={(e) => void stop(e, a)}>
                <label>
                  Terakhir digunakan (opsional)
                  <input
                    type="date"
                    name="stopDate"
                    min={a.startDate}
                    defaultValue={a.stopDate ?? ""}
                  />
                </label>
                <small>
                  Kosongkan untuk mengikuti masa pakai semula. Aset tetap
                  disimpan dalam riwayat.
                </small>
                <button className="button secondary" disabled={busy}>
                  Simpan penghentian
                </button>
              </form>
            </article>
          );
        })}
      </div>
    </>
  );
}
