"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { CashOrderPicker } from "@/features/cash/order-picker";
import type { OrderRow } from "@/features/orders/schema";
import type { ExpenseRow } from "@/features/expenses/schema";
import { expenseGroups } from "@/features/expenses/schema";
import { useTradeRequest } from "./client";
import {
  invoiceSchema,
  invoiceEditSchema,
  type InvoiceRow,
  type TradeKind,
} from "./schema";
import "@/features/cash/cash.css";
import "./trade.css";
export function InvoiceForm({
  kind,
  today,
  posts,
  initial,
  initialOrder,
}: {
  kind: TradeKind;
  today: string;
  posts: ExpenseRow[];
  initial?: InvoiceRow;
  initialOrder?: OrderRow | null;
}) {
  const tradeRequest = useTradeRequest();
  const router = useRouter(),
    key = useRef<string | null>(null),
    ar = kind === "RECEIVABLE";
  const [order, setOrder] = useState<OrderRow | null>(initialOrder ?? null),
    [reference, setReference] = useState(initial?.reference ?? ""),
    [party, setParty] = useState(initial?.partyName ?? ""),
    [amount, setAmount] = useState(initial?.amount ?? ""),
    [issue, setIssue] = useState(initial?.issueDate ?? today),
    [due, setDue] = useState(initial?.dueDate ?? today),
    [post, setPost] = useState(initial?.expensePostId ?? ""),
    [notes, setNotes] = useState(initial?.notes ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const back = initial
    ? `/hutang-piutang/${initial.id}`
    : `/hutang-piutang?kind=${kind}`;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    key.current ??= crypto.randomUUID();
    const values = {
      reference,
      partyName: ar ? (initial?.partyName ?? order?.customerName ?? "") : party,
      amount: ar ? (initial?.amount ?? order?.totalPrice ?? "") : amount,
      issueDate: issue,
      dueDate: due,
      notes,
    };
    const parsed = initial
      ? invoiceEditSchema.safeParse({ ...values, updatedAt: initial.updatedAt })
      : invoiceSchema.safeParse({
          ...values,
          id: key.current,
          kind,
          orderId: order?.id ?? null,
          expensePostId: ar ? null : post || null,
        });
    if (!parsed.success) {
      setError(parsed.error.issues.map((x) => x.message).join(" "));
      return;
    }
    setBusy(true);
    try {
      const saved = await tradeRequest<InvoiceRow>(
        initial ? `/api/trade-invoices/${initial.id}` : "/api/trade-invoices",
        initial ? "PATCH" : "POST",
        parsed.data,
      );
      router.push(`/hutang-piutang/${saved.id}`);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Tagihan belum berhasil disimpan.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="trade-page">
      <Link className="trade-back" href={back}>
        ← Kembali
      </Link>
      <PageHeading
        title={`${initial ? "Koreksi" : "Tambah"} ${ar ? "piutang" : "hutang"}`}
        description={
          ar
            ? "Pilih pesanan, lalu tentukan nomor tagihan dan jatuh tempo. DP yang sudah masuk dapat ditautkan setelah tagihan disimpan."
            : "Catat tagihan pemasok untuk bahan atau jasa. Pembayaran dicatat setelah tagihan tersimpan."
        }
      />
      {error && (
        <div className="alert error" role="alert">
          {error}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => router.refresh()}
          >
            Muat ulang data
          </button>
        </div>
      )}
      <form className="trade-form" onSubmit={submit}>
        {!initial && (
          <CashOrderPicker
            order={order}
            onChange={(r) => {
              setOrder(r);
              if (ar) {
                setAmount(r?.totalPrice ?? "");
                setParty(r?.customerName ?? "");
              }
            }}
            disabled={busy}
            required={ar}
            description={
              ar
                ? "Pesanan menjadi sumber nama pelanggan dan total tagihan. Satu pesanan memiliki satu piutang aktif."
                : "Hubungkan jika tagihan pemasok digunakan untuk pesanan tertentu."
            }
          />
        )}
        {initial && (
          <p className="trade-help">
            Pesanan: {initial.orderNumber ?? "Tanpa pesanan tertaut"}.{" "}
            {ar
              ? "Pelanggan dan nilai piutang mengikuti pesanan."
              : `Pos: ${initial.expensePostName}. Tautan pos dan pesanan dipertahankan saat koreksi.`}
          </p>
        )}
        <div className="trade-form-grid">
          <label>
            Nomor tagihan
            <input
              required
              maxLength={100}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={busy}
              placeholder={
                ar ? "Contoh: INV-2026-001" : "Nomor nota dari pemasok"
              }
            />
          </label>
          <label>
            {ar ? "Nama pelanggan" : "Nama pemasok"}
            <input
              required
              maxLength={200}
              readOnly={ar}
              value={
                ar ? (initial?.partyName ?? order?.customerName ?? "") : party
              }
              onChange={(e) => setParty(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Tanggal tagihan
            <input
              type="date"
              required
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Jatuh tempo
            <input
              type="date"
              required
              min={issue}
              value={due}
              onChange={(e) => setDue(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Total tagihan (Rp)
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{1,18}"
              readOnly={ar}
              value={ar ? (initial?.amount ?? order?.totalPrice ?? "") : amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
            />
          </label>
          {!ar && !initial && (
            <label>
              Pos pengeluaran
              <select
                required
                value={post}
                onChange={(e) => setPost(e.target.value)}
                disabled={busy}
              >
                <option value="">Pilih pos pengeluaran</option>
                {posts
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {expenseGroups[p.group]}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="trade-wide">
            Catatan (opsional)
            <textarea
              maxLength={2000}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
            />
          </label>
        </div>
        <div className="trade-effect">
          {initial
            ? "Koreksi mengubah rincian tagihan; transaksi pembayaran yang sudah tercatat tetap dipertahankan."
            : "Menyimpan tagihan belum mengubah saldo Buku Kas."}
        </div>
        <div className="trade-actions">
          <button type="submit" disabled={busy || (!initial && ar && !order)}>
            {busy ? "Menyimpan…" : `Simpan ${ar ? "piutang" : "hutang"}`}
          </button>
          <Link className="button secondary" href={back}>
            Batal
          </Link>
        </div>
      </form>
    </div>
  );
}
