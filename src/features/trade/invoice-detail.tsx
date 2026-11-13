"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Link2,
  Pencil,
  Search,
} from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { displayDate } from "@/lib/date";
import { ExactDecimal, formatRupiah } from "@/lib/money";
import { notifyDataChanged } from "@/lib/notify-data-changed";
import { useTradeRequest } from "./client";
import {
  paymentSchema,
  reasonSchema,
  tradeKinds,
  type InvoiceDetail as Detail,
  type CashCandidate,
  type PaymentRow,
} from "./schema";
import { InvoiceStatus } from "./trade-list";
import "./trade.css";
type Candidates = {
  rows: CashCandidate[];
  page: number;
  totalPages: number;
  total: number;
};
export function InvoiceDetail({
  invoice: r,
  today,
}: {
  invoice: Detail;
  today: string;
}) {
  const tradeRequest = useTradeRequest();
  const router = useRouter(),
    key = useRef<string | null>(null),
    controller = useRef<AbortController | null>(null),
    [transition, startTransition] = useTransition();
  const [mode, setMode] = useState<"" | "NEW" | "LINK" | "CANCEL" | "VOID">(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(today),
    [notes, setNotes] = useState(""),
    [reason, setReason] = useState(""),
    [payment, setPayment] = useState<PaymentRow | null>(null),
    [q, setQ] = useState(""),
    [candidates, setCandidates] = useState<Candidates | null>(null),
    [candidateLoading, setCandidateLoading] = useState(false),
    [candidateError, setCandidateError] = useState(""),
    [cashId, setCashId] = useState("");
  const pending = busy || transition,
    ar = r.kind === "RECEIVABLE",
    active = !r.cancelledAt,
    remaining = new ExactDecimal(r.remaining),
    label = ar ? "piutang" : "hutang";
  useEffect(() => () => controller.current?.abort(), []);
  function open(next: typeof mode) {
    controller.current?.abort();
    setMode(next);
    setError("");
    setNotice("");
    setReason("");
    setNotes("");
    setCashId("");
    setCandidates(null);
    setCandidateError("");
    key.current = null;
  }
  async function searchCandidates(value = q, page = 1) {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setCandidateLoading(true);
    setCandidateError("");
    setCashId("");
    try {
      const data = await tradeRequest<Candidates>(
        `/api/trade-invoices/${r.id}/candidates?${new URLSearchParams({ q: value, page: String(page) })}`,
        "GET",
        undefined,
        request.signal,
      );
      if (!request.signal.aborted) setCandidates(data);
    } catch (e) {
      if (!request.signal.aborted)
        setCandidateError(
          e instanceof Error ? e.message : "Transaksi belum dapat dimuat.",
        );
    } finally {
      if (!request.signal.aborted) setCandidateLoading(false);
    }
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    let path = `/api/trade-invoices/${r.id}`,
      method = "POST",
      body: unknown;
    if (mode === "NEW" || mode === "LINK") {
      key.current ??= crypto.randomUUID();
      const parsed = paymentSchema.safeParse(
        mode === "NEW"
          ? {
              mode,
              id: key.current,
              updatedAt: r.updatedAt,
              amount,
              transactionDate: date,
              notes,
            }
          : { mode, id: key.current, updatedAt: r.updatedAt, cashId, notes },
      );
      if (!parsed.success) {
        setError(parsed.error.issues.map((x) => x.message).join(" "));
        return;
      }
      if (
        mode === "NEW" &&
        new ExactDecimal(
          parsed.data.mode === "NEW" ? parsed.data.amount : 0,
        ).gt(remaining)
      ) {
        setError("Pembayaran melebihi sisa tagihan.");
        return;
      }
      body = parsed.data;
      path += "/payments";
    } else {
      const parsed = reasonSchema.safeParse({ updatedAt: r.updatedAt, reason });
      if (!parsed.success) {
        setError(parsed.error.issues.map((x) => x.message).join(" "));
        return;
      }
      body = parsed.data;
      method = "DELETE";
      if (mode === "VOID" && payment) path += `/payments/${payment.id}`;
      else if (mode !== "CANCEL") return;
    }
    setBusy(true);
    try {
      await tradeRequest(path, method, body);
      setNotice(
        mode === "NEW"
          ? `Pembayaran tersimpan. Buku Kas mencatat ${ar ? "pemasukan" : "pengeluaran"} yang sama.`
          : mode === "LINK"
            ? "Pembayaran lama dihubungkan. Saldo kas tidak dihitung lagi."
            : mode === "CANCEL"
              ? "Tagihan dibatalkan; riwayatnya tetap tersimpan."
              : payment?.createdCash
                ? "Pembayaran dibatalkan. Transaksi kas yang dibuat dari pembayaran ini dikeluarkan dari saldo aktif."
                : "Tautan pembayaran dilepas. Transaksi Buku Kas lama tetap aktif.",
      );
      setMode("");
      key.current = null;
      notifyDataChanged();
      startTransition(() => router.refresh());
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Perubahan belum berhasil disimpan.",
      );
    } finally {
      setBusy(false);
    }
  }
  const effectAmount =
    mode === "NEW" && /^\d{1,18}$/.test(amount)
      ? new ExactDecimal(amount)
      : null;
  return (
    <div className="trade-page">
      <Link className="trade-back" href={`/hutang-piutang?kind=${r.kind}`}>
        ← Kembali ke daftar {label}
      </Link>
      <PageHeading
        eyebrow={tradeKinds[r.kind]}
        title={r.reference}
        description={r.partyName}
        action={
          active ? (
            <Link
              className="button secondary"
              href={`/hutang-piutang/${r.id}/edit`}
            >
              <Pencil size={16} />
              Koreksi tagihan
            </Link>
          ) : undefined
        }
      />
      {error && (
        <div className="alert error" role="alert">
          {error}{" "}
          <button
            className="text-button"
            type="button"
            onClick={() => startTransition(() => router.refresh())}
          >
            Muat ulang data
          </button>
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      <div className="trade-meta">
        <InvoiceStatus row={r} />
        <div>
          <span>Tanggal tagihan</span>
          {displayDate(r.issueDate)}
        </div>
        <div>
          <span>Jatuh tempo</span>
          {displayDate(r.dueDate)}
        </div>
        <div>
          <span>Pesanan</span>
          {r.orderId ? (
            <Link href={`/permintaan/${r.orderId}/edit`}>{r.orderNumber}</Link>
          ) : (
            "Tanpa pesanan tertaut"
          )}
        </div>
        {!ar && (
          <div>
            <span>Pos pengeluaran</span>
            {r.expensePostName}
          </div>
        )}
      </div>
      <div className="trade-stats">
        <div>
          <span>Total tagihan</span>
          <strong>{formatRupiah(r.amount)}</strong>
        </div>
        <div>
          <span>Sudah dibayar</span>
          <strong>{formatRupiah(r.paidAmount)}</strong>
        </div>
        <div>
          <span>Sisa {label}</span>
          <strong>{formatRupiah(r.remaining)}</strong>
        </div>
      </div>
      {r.notes && <p className="trade-notes">{r.notes}</p>}
      {active && mode === "" && (
        <div className="trade-actions">
          <button
            disabled={pending || remaining.lte(0)}
            onClick={() => {
              open("NEW");
              setAmount(r.remaining);
              setDate(today < r.issueDate ? r.issueDate : today);
            }}
          >
            {ar ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}Catat
            pembayaran
          </button>
          <button
            className="button secondary"
            disabled={pending || remaining.lte(0)}
            onClick={() => {
              open("LINK");
              void searchCandidates("", 1);
              setQ("");
            }}
          >
            <Link2 size={16} />
            Hubungkan pembayaran lama
          </button>
          <button
            className="text-button danger-text"
            disabled={pending || new ExactDecimal(r.paidAmount).gt(0)}
            onClick={() => open("CANCEL")}
          >
            Batalkan tagihan
          </button>
        </div>
      )}
      {r.cancelledAt && (
        <div className="trade-effect">
          Tagihan dibatalkan. Alasan: {r.cancelReason}
        </div>
      )}
      {(mode === "NEW" || mode === "LINK") && (
        <section
          className="trade-payment-panel"
          aria-labelledby="trade-payment-heading"
        >
          <h2 id="trade-payment-heading">
            {mode === "NEW" ? "Catat pembayaran" : "Hubungkan pembayaran lama"}
          </h2>
          {mode === "LINK" && (
            <>
              <p className="trade-help">
                Pilih transaksi Buku Kas yang sudah ada. Jenis, kategori/pos,
                dan pesanan harus sesuai. Satu transaksi ditautkan utuh;
                nominalnya tidak boleh melebihi sisa tagihan.
              </p>
              <div className="trade-candidate-search">
                <label>
                  Cari keterangan transaksi
                  <input
                    value={q}
                    maxLength={150}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void searchCandidates(q, 1);
                      }
                    }}
                  />
                </label>
                <button
                  className="button secondary"
                  type="button"
                  disabled={pending || candidateLoading}
                  onClick={() => void searchCandidates(q, 1)}
                >
                  <Search size={16} />
                  Cari
                </button>
              </div>
              {candidateLoading && <p role="status">Memuat transaksi…</p>}
              {candidateError && (
                <p role="alert" className="danger-text">
                  {candidateError}
                </p>
              )}
              {!candidateLoading && candidates && (
                <div className="trade-candidates">
                  {candidates.rows.length ? (
                    candidates.rows.map((c) => (
                      <label className="trade-candidate" key={c.id}>
                        <input
                          type="radio"
                          name="cashCandidate"
                          value={c.id}
                          checked={cashId === c.id}
                          disabled={pending}
                          onChange={() => setCashId(c.id)}
                        />
                        <span>
                          <strong>{c.description}</strong>
                          <small>
                            {displayDate(c.transactionDate)} ·{" "}
                            {ar ? "Pemasukan" : "Pengeluaran"}
                          </small>
                        </span>
                        <strong className="trade-money">
                          {formatRupiah(c.amount)}
                        </strong>
                      </label>
                    ))
                  ) : (
                    <p>Belum ada transaksi lama yang memenuhi syarat.</p>
                  )}
                  <div className="trade-pagination">
                    <span>{candidates.total} transaksi sesuai</span>
                    <div>
                      <button
                        className="button secondary"
                        type="button"
                        disabled={pending || candidates.page <= 1}
                        onClick={() =>
                          void searchCandidates(q, candidates.page - 1)
                        }
                      >
                        Sebelumnya
                      </button>
                      <button
                        className="button secondary"
                        type="button"
                        disabled={
                          pending || candidates.page >= candidates.totalPages
                        }
                        onClick={() =>
                          void searchCandidates(q, candidates.page + 1)
                        }
                      >
                        Berikutnya
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <form onSubmit={submit}>
            <div className="trade-form-grid">
              {mode === "NEW" && (
                <>
                  <label>
                    Tanggal pembayaran
                    <input
                      type="date"
                      required
                      min={r.issueDate}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      disabled={pending}
                    />
                  </label>
                  <label>
                    Nominal pembayaran (Rp)
                    <input
                      inputMode="numeric"
                      required
                      pattern="[0-9]{1,18}"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={pending}
                    />
                  </label>
                  <button
                    className="text-button"
                    type="button"
                    disabled={pending}
                    onClick={() => setAmount(r.remaining)}
                  >
                    Isi sebesar sisa tagihan
                  </button>
                </>
              )}
              <label className="trade-wide">
                Catatan (opsional)
                <input
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={pending}
                />
              </label>
            </div>
            <div className="trade-effect" aria-live="polite">
              {mode === "NEW" ? (
                <>
                  Buku Kas akan mencatat {ar ? "pemasukan" : "pengeluaran"}
                  {effectAmount
                    ? ` ${formatRupiah(effectAmount.toFixed(0))}`
                    : ""}
                  .
                  {effectAmount && effectAmount.lte(remaining) && (
                    <span>
                      Sisa {label} menjadi{" "}
                      {formatRupiah(remaining.sub(effectAmount).toFixed(0))}.
                    </span>
                  )}
                  <span>
                    Jika DP sudah ada di Buku Kas, gunakan Hubungkan pembayaran
                    lama.
                  </span>
                </>
              ) : (
                "Memakai transaksi Buku Kas yang sudah ada. Saldo kas tidak berubah lagi."
              )}
            </div>
            <div className="trade-actions">
              <button
                type="submit"
                disabled={
                  pending || (mode === "LINK" && (!cashId || candidateLoading))
                }
              >
                {pending
                  ? "Menyimpan…"
                  : mode === "NEW"
                    ? "Simpan pembayaran"
                    : "Hubungkan transaksi"}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={pending}
                onClick={() => open("")}
              >
                Batal
              </button>
            </div>
          </form>
        </section>
      )}
      {(mode === "CANCEL" || mode === "VOID") && (
        <form className="trade-payment-panel" onSubmit={submit}>
          <h2>
            {mode === "CANCEL"
              ? "Batalkan tagihan"
              : payment?.createdCash
                ? "Batalkan pembayaran"
                : "Lepaskan tautan pembayaran"}
          </h2>
          <p>
            {mode === "CANCEL"
              ? "Tagihan dikeluarkan dari daftar aktif. Riwayat tagihan tetap disimpan."
              : payment?.createdCash
                ? "Sisa tagihan bertambah kembali. Transaksi Buku Kas yang dibuat dari pembayaran ini juga dibatalkan."
                : "Sisa tagihan bertambah kembali. Transaksi Buku Kas lama tetap aktif dan saldo kas tidak berubah."}
          </p>
          <label>
            Alasan
            <input
              required
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
            />
          </label>
          <div className="trade-actions">
            <button type="submit" className="danger" disabled={pending}>
              {pending
                ? "Menyimpan…"
                : mode === "CANCEL"
                  ? "Ya, batalkan tagihan"
                  : payment?.createdCash
                    ? "Ya, batalkan pembayaran"
                    : "Ya, lepaskan tautan"}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={pending}
              onClick={() => open("")}
            >
              Kembali
            </button>
          </div>
        </form>
      )}
      <section className="trade-history">
        <h2>Riwayat pembayaran</h2>
        {!r.payments.length && (
          <p className="trade-help">
            Belum ada pembayaran. Catat pembayaran baru atau hubungkan DP yang
            sudah ada di Buku Kas.
          </p>
        )}
        {r.payments.map((p) => (
          <div
            key={p.id}
            className={`trade-history-row${p.voidedAt ? " trade-voided" : ""}`}
          >
            <div>
              <strong>{displayDate(p.transactionDate)}</strong>
              <span>
                Buku Kas · {ar ? "Pemasukan" : "Pengeluaran"} ·{" "}
                {p.createdCash
                  ? "Dibuat dari pembayaran"
                  : "Transaksi lama tertaut"}
              </span>
              {p.notes && <small>{p.notes}</small>}
              {p.voidedAt ? (
                <small>
                  {p.createdCash ? "Pembayaran dibatalkan" : "Tautan dilepas"}:{" "}
                  {p.voidReason}
                </small>
              ) : (
                <Link
                  href={`/buku-kas?q=${encodeURIComponent(p.description.slice(0, 150))}`}
                >
                  Lihat di Buku Kas ↗
                </Link>
              )}
            </div>
            <strong className="trade-money">{formatRupiah(p.amount)}</strong>
            {active && !p.voidedAt && (
              <button
                className="text-button danger-text"
                disabled={pending || mode !== ""}
                onClick={() => {
                  open("VOID");
                  setPayment(p);
                }}
              >
                {p.createdCash ? "Batalkan pembayaran" : "Lepaskan tautan"}
              </button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
