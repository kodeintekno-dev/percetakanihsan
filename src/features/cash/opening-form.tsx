"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Wallet } from "lucide-react";
import { notifyDataChanged } from "@/lib/notify-data-changed";
import { formatRupiah } from "@/lib/money";
import { displayDate } from "@/lib/date";
import { PageHeading } from "@/components/page-heading";
import type { OpeningState } from "./schema";
export function OpeningForm({
  opening,
  transactionCount,
  firstTransactionDate,
  today,
}: {
  opening: OpeningState;
  transactionCount: number;
  firstTransactionDate: string | null;
  today: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(opening),
    [ackNeeded, setAckNeeded] = useState(transactionCount > 0);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    setFields({});
    try {
      const response = await fetch("/api/cash-opening", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openingDate: form.get("openingDate"),
          openingAmount: form.get("openingAmount"),
          updatedAt: current?.updatedAt ?? null,
          acknowledge: form.get("acknowledge") === "on",
        }),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        setError(result.error);
        setFields(result.fields ?? {});
        if (result.fields?.acknowledge) setAckNeeded(true);
        return;
      }
      setCurrent(result.opening);
      setMessage(result.message);
      notifyDataChanged();
      router.refresh();
    } catch {
      setError(
        "Koneksi terputus. Periksa kembali pengaturan sebelum mencoba menyimpan ulang.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="PENGATURAN KAS"
        title="Saldo Kas Awal"
        description="Tetapkan saldo yang benar-benar tersedia pada tanggal mulai pencatatan. Ini bukan pemasukan usaha."
      />
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
      <section className="panel opening-current">
        <span className="icon-tile">
          <Wallet size={25} />
        </span>
        <div>
          <span className="eyebrow">STATUS PEMBUKAAN</span>
          <h2>
            {current
              ? formatRupiah(current.openingAmount)
              : "Belum dikonfigurasi"}
          </h2>
          <p>
            {current
              ? `Berlaku mulai ${displayDate(current.openingDate)}. Nilai ini tidak masuk pendapatan.`
              : "Saldo belum diasumsikan nol. Isi nominal dan tanggal efektif untuk menghitung saldo kas."}
          </p>
        </div>
      </section>
      <form
        className="panel order-form-panel opening-form"
        onSubmit={submit}
        aria-busy={pending}
      >
        <h2>Pengaturan pembukaan</h2>
        <div className="form-columns">
          <label>
            Tanggal efektif
            <input
              type="date"
              name="openingDate"
              required
              defaultValue={opening?.openingDate ?? today}
              aria-invalid={!!fields.openingDate}
            />
            {fields.openingDate && (
              <small className="field-error order-field-error">
                {fields.openingDate[0]}
              </small>
            )}
          </label>
          <label>
            Saldo awal (Rp)
            <input
              name="openingAmount"
              required
              inputMode="numeric"
              maxLength={18}
              placeholder="Contoh: 2000000"
              defaultValue={opening?.openingAmount ?? ""}
              aria-invalid={!!fields.openingAmount}
            />
            {fields.openingAmount && (
              <small className="field-error order-field-error">
                {fields.openingAmount[0]}
              </small>
            )}
          </label>
        </div>
        <div className="info-strip">
          <p>
            Tanggal pembukaan harus pada atau sebelum transaksi pertama.
            Transaksi baru tidak boleh bertanggal lebih awal dari pembukaan.
            Nominal boleh nol jika memang tidak ada kas saat mulai.
          </p>
        </div>
        {ackNeeded && (
          <div className="opening-confirm">
            <p>
              Sudah ada transaksi tercatat
              {transactionCount
                ? ` (${transactionCount} transaksi aktif)`
                : " di sesi lain"}
              . Mengubah pembukaan akan mengubah hitungan saldo awal dan saldo
              akhir.
              {firstTransactionDate
                ? ` Transaksi pertama: ${displayDate(firstTransactionDate)}.`
                : ""}
            </p>
            <label className="checkbox-label">
              <input type="checkbox" name="acknowledge" required />
              Saya memahami dampak pengaturan ini terhadap saldo kas.
            </label>
            {fields.acknowledge && (
              <small className="field-error order-field-error">
                {fields.acknowledge[0]}
              </small>
            )}
          </div>
        )}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="order-form-actions">
          <button type="submit" disabled={pending}>
            <Save size={17} />
            {pending ? "Menyimpan…" : "Simpan saldo awal"}
          </button>
        </div>
      </form>
    </>
  );
}
