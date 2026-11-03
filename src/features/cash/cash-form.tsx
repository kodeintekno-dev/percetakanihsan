"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Search,
  Unlink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { formatRupiah, formatQuantity, ExactDecimal } from "@/lib/money";
import { notifyDataChanged } from "@/lib/notify-data-changed";
import type { CategoryRow } from "@/features/categories/schema";
import { expenseGroups, type ExpenseRow } from "@/features/expenses/schema";
import type { OrderRow, OrderPage } from "@/features/orders/schema";
import { cashTypes, incomeKinds, type CashRow } from "./schema";
type Allocation = {
  quantity: string;
  unit: string;
  allocatedQuantity: string;
  remainingQuantity: string;
};
export function CashForm({
  initial,
  initialOrder,
  categories,
  posts,
  today,
  openingDate,
}: {
  initial?: CashRow;
  initialOrder?: OrderRow;
  categories: CategoryRow[];
  posts: ExpenseRow[];
  today: string;
  openingDate: string | null;
}) {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const [type, setType] = useState<CashRow["type"]>(initial?.type ?? "INCOME"),
    [kind, setKind] = useState<"SALE" | "OTHER">(initial?.incomeKind ?? "SALE");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? ""),
    [subId, setSubId] = useState(initial?.subcategoryId ?? ""),
    [postId, setPostId] = useState(initial?.expensePostId ?? "");
  const [order, setOrder] = useState<OrderRow | null>(initialOrder ?? null),
    [allocation, setAllocation] = useState<Allocation | null>(null),
    [orderQuery, setOrderQuery] = useState("");
  const [results, setResults] = useState<OrderPage | null>(null),
    [searching, setSearching] = useState(false);
  const [soldUnit, setSoldUnit] = useState(initial?.soldUnit ?? ""),
    [amount, setAmount] = useState(initial?.amount ?? "");
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const sale = type === "INCOME" && kind === "SALE";
  const roots = categories.filter(
    (row) =>
      !row.parentId &&
      (row.isActive ||
        row.id === initial?.categoryId ||
        row.id === order?.categoryId),
  );
  const children = categories.filter(
    (row) =>
      row.parentId === categoryId &&
      (row.isActive ||
        row.id === initial?.subcategoryId ||
        row.id === order?.subcategoryId),
  );
  const chosenPost = posts.find((row) => row.id === postId);
  const group =
    initial?.type === "EXPENSE" && postId === initial.expensePostId
      ? initial.expenseGroupSnapshot
      : chosenPost?.group;
  function field(name: string) {
    return fields[name] ? (
      <small className="field-error order-field-error" id={`${name}-error`}>
        {fields[name][0]}
      </small>
    ) : null;
  }
  function attributes(name: string) {
    return {
      "aria-invalid": !!fields[name],
      "aria-describedby": fields[name] ? `${name}-error` : undefined,
    };
  }
  async function searchOrders(page = 1) {
    setSearching(true);
    setError("");
    try {
      const params = new URLSearchParams({
        q: orderQuery,
        page: String(page),
        pageSize: "10",
      });
      const response = await fetch(`/api/orders?${params}`);
      const value = await response.json();
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        setError(value.error);
        return;
      }
      setResults(value);
    } catch {
      setError("Pesanan belum dapat dimuat. Coba cari kembali.");
    } finally {
      setSearching(false);
    }
  }
  async function selectOrder(row: OrderRow) {
    setOrder(row);
    setCategoryId(row.categoryId);
    setSubId(row.subcategoryId ?? "");
    setSoldUnit(row.unit);
    setAllocation(null);
    setSearching(true);
    setError("");
    try {
      const excluded =
        initial?.orderId === row.id
          ? `?excludeTransactionId=${encodeURIComponent(initial.id)}`
          : "";
      const response = await fetch(
        `/api/orders/${row.id}/allocation${excluded}`,
      );
      const value = await response.json();
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        setError(value.error);
        return;
      }
      setAllocation(value);
    } catch {
      setError(
        "Sisa kuantitas belum dapat dimuat. Server tetap akan memeriksa alokasi saat disimpan.",
      );
    } finally {
      setSearching(false);
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    setFields({});
    const transactionType = String(form.get("type")),
      incomeKind = String(form.get("incomeKind"));
    const quantity = String(form.get("soldQuantity") ?? "").trim();
    const data = {
      transactionDate: form.get("transactionDate"),
      type: transactionType,
      description: form.get("description"),
      amount: form.get("amount"),
      ...(transactionType === "EXPENSE"
        ? { expensePostId: form.get("expensePostId") || null }
        : incomeKind === "OTHER"
          ? { incomeKind: "OTHER" }
          : {
              incomeKind: "SALE",
              categoryId: form.get("categoryId") || null,
              subcategoryId: form.get("subcategoryId") || null,
              orderId: form.get("orderId") || null,
              soldQuantity: quantity === "" ? null : quantity,
              soldUnit: quantity === "" ? null : form.get("soldUnit") || null,
            }),
    };
    if (!initial) key.current ??= crypto.randomUUID();
    try {
      const response = await fetch(
        initial
          ? `/api/cash-transactions/${initial.id}`
          : "/api/cash-transactions",
        {
          method: initial ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            initial
              ? { data, updatedAt: initial.updatedAt }
              : { data, requestKey: key.current },
          ),
        },
      );
      const value = await response.json();
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        setError(value.error);
        setFields(value.fields ?? {});
        return;
      }
      notifyDataChanged();
      router.push(
        `/buku-kas?notice=${initial ? "updated" : value.replayed ? "replayed" : "created"}`,
      );
      router.refresh();
    } catch {
      setError(
        "Koneksi terputus. Periksa daftar atau coba simpan kembali pada form ini; transaksi yang sama tidak akan dicatat dua kali.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Link className="back-link" href="/buku-kas">
        <ArrowLeft size={16} />
        Daftar buku kas
      </Link>
      <PageHeading
        eyebrow="PENCATATAN KAS"
        title={initial ? "Ubah Transaksi" : "Catat Transaksi"}
        description="Catat hanya uang yang benar-benar diterima atau dibayar. Pesanan dan estimasi HPP tidak membuat transaksi otomatis."
      />
      <form
        className="order-form cash-form"
        onSubmit={submit}
        aria-busy={pending}
      >
        <section className="panel order-form-panel">
          <div className="order-section-title">
            <span>01</span>
            <div>
              <h2>Uang masuk atau keluar</h2>
              <p>Jumlah harus lebih dari nol dalam Rupiah utuh.</p>
            </div>
          </div>
          <div className="form-columns">
            <label>
              Tanggal transaksi
              <input
                name="transactionDate"
                type="date"
                required
                min={openingDate ?? undefined}
                defaultValue={initial?.transactionDate ?? today}
                {...attributes("transactionDate")}
              />
              {field("transactionDate")}
            </label>
            <label>
              Jenis transaksi
              <select
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value as CashRow["type"])}
              >
                {Object.entries(cashTypes).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
              {field("type")}
            </label>
            <label className="cash-wide">
              Keterangan
              <textarea
                name="description"
                rows={3}
                required
                maxLength={5000}
                defaultValue={initial?.description ?? ""}
                placeholder="Contoh: Pelunasan banner atau pembelian kertas"
                {...attributes("description")}
              />
              {field("description")}
            </label>
            <label className="cash-wide">
              Jumlah (Rp)
              <input
                name="amount"
                inputMode="numeric"
                required
                maxLength={18}
                placeholder="Contoh: 1200000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                {...attributes("amount")}
              />
              {field("amount")}
            </label>
          </div>
          {/^\d{1,18}$/.test(amount) && (
            <div
              className={`cash-amount-preview ${type === "INCOME" ? "cash-income" : "cash-expense"}`}
            >
              {type === "INCOME" ? "+" : "−"}
              {formatRupiah(amount)}
            </div>
          )}
        </section>
        <section className="panel order-form-panel">
          <div className="order-section-title">
            <span>02</span>
            <div>
              <h2>
                {type === "EXPENSE" ? "Pos pengeluaran" : "Sumber pemasukan"}
              </h2>
              <p>
                {type === "EXPENSE"
                  ? "Kelompok biaya disimpan sesuai pos saat transaksi dicatat."
                  : "Pilih penjualan produk atau pemasukan lain-lain."}
              </p>
            </div>
          </div>
          {type === "EXPENSE" ? (
            <>
              <label>
                Pos pengeluaran
                <select
                  name="expensePostId"
                  required
                  value={postId}
                  onChange={(e) => setPostId(e.target.value)}
                  {...attributes("expensePostId")}
                >
                  <option value="">Pilih pos pengeluaran</option>
                  {posts
                    .filter(
                      (row) =>
                        row.isActive || row.id === initial?.expensePostId,
                    )
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name} · {expenseGroups[row.group]}
                        {row.isActive ? "" : " (arsip)"}
                      </option>
                    ))}
                </select>
                {field("expensePostId")}
              </label>
              {group && (
                <div className="alert">
                  Kelompok pada transaksi ini:{" "}
                  <strong>{expenseGroups[group]}</strong>. Perubahan kelompok
                  master tidak mengubah pengelompokan transaksi lama.
                </div>
              )}
              <p className="muted cash-help">
                Pos belum tersedia?{" "}
                <Link href="/pos-pengeluaran">Kelola pos pengeluaran</Link>.
              </p>
            </>
          ) : (
            <label>
              Jenis pemasukan
              <select
                name="incomeKind"
                value={kind}
                onChange={(e) => setKind(e.target.value as "SALE" | "OTHER")}
              >
                {Object.entries(incomeKinds).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {field("incomeKind")}
            </label>
          )}
          {sale && (
            <>
              <div className="form-columns cash-sale-categories">
                <label>
                  Kategori produk
                  <select
                    name="categoryId"
                    value={categoryId}
                    required
                    onChange={(e) => {
                      setCategoryId(e.target.value);
                      setSubId("");
                      setOrder(null);
                      setAllocation(null);
                    }}
                    {...attributes("categoryId")}
                  >
                    <option value="">Pilih kategori utama</option>
                    {roots.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                        {row.isActive ? "" : " (arsip)"}
                      </option>
                    ))}
                  </select>
                  {field("categoryId")}
                </label>
                <label>
                  Subkategori (opsional)
                  <select
                    name="subcategoryId"
                    disabled={!categoryId || !children.length}
                    value={subId}
                    onChange={(e) => {
                      setSubId(e.target.value);
                      setOrder(null);
                      setAllocation(null);
                    }}
                    {...attributes("subcategoryId")}
                  >
                    <option value="">Tanpa subkategori</option>
                    {children.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                        {row.isActive ? "" : " (arsip)"}
                      </option>
                    ))}
                  </select>
                  {field("subcategoryId")}
                </label>
              </div>
              {initial?.incomeKind === "SALE" && (
                <p className="order-history-note">
                  Produk saat pencatatan: {initial.productNameSnapshot}. Nama
                  historis tetap disimpan bila kategori tidak diganti.
                </p>
              )}
              <div className="cash-order-picker">
                <h3>Hubungkan pesanan (opsional)</h3>
                <p className="muted cash-help">
                  Cari nama pelanggan, produk, atau kode pesanan. Memilih
                  pesanan menyesuaikan kategori; tidak menyalin kuantitas secara
                  otomatis.
                </p>
                <div className="cash-order-search">
                  <input
                    aria-label="Cari pesanan"
                    placeholder="Pelanggan atau kode pesanan"
                    value={orderQuery}
                    onChange={(e) => setOrderQuery(e.target.value)}
                    maxLength={150}
                  />
                  <button
                    className="button secondary"
                    type="button"
                    disabled={searching || pending}
                    onClick={() => void searchOrders()}
                  >
                    <Search size={16} />
                    {searching ? "Mencari…" : "Cari pesanan"}
                  </button>
                </div>
                {results && (
                  <div className="cash-order-results">
                    {results.rows.length ? (
                      results.rows.map((row) => (
                        <button
                          type="button"
                          className="cash-order-option"
                          key={row.id}
                          disabled={pending || searching}
                          onClick={() => void selectOrder(row)}
                        >
                          <strong>{row.customerName}</strong>
                          <span>
                            {row.productNameSnapshot} ·{" "}
                            {formatQuantity(row.quantity)} {row.unit}
                          </span>
                          <small>{row.orderNumber}</small>
                        </button>
                      ))
                    ) : (
                      <p className="cash-help muted">
                        Tidak ada pesanan aktif yang cocok.
                      </p>
                    )}
                    <div className="cash-order-pagination">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Pesanan sebelumnya"
                        disabled={results.page <= 1 || searching}
                        onClick={() => void searchOrders(results.page - 1)}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span>
                        Halaman {results.page} / {results.totalPages} ·{" "}
                        {results.total} hasil
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Pesanan berikutnya"
                        disabled={
                          results.page >= results.totalPages || searching
                        }
                        onClick={() => void searchOrders(results.page + 1)}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
                <input type="hidden" name="orderId" value={order?.id ?? ""} />
                {order && (
                  <div className="cash-linked-order">
                    <div>
                      <strong>{order.customerName}</strong>
                      <small>
                        {order.orderNumber} · {formatQuantity(order.quantity)}{" "}
                        {order.unit}
                      </small>
                      {allocation && (
                        <small>
                          Belum dialokasikan:{" "}
                          {formatQuantity(allocation.remainingQuantity)}{" "}
                          {allocation.unit} (penerimaan yang sedang diedit
                          dikecualikan).
                        </small>
                      )}
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Lepaskan pesanan"
                      onClick={() => {
                        setOrder(null);
                        setAllocation(null);
                      }}
                    >
                      <Unlink size={18} />
                    </button>
                  </div>
                )}
                {field("orderId")}
              </div>
              <div className="form-columns">
                <label>
                  Kuantitas terjual pada penerimaan ini (opsional)
                  <input
                    name="soldQuantity"
                    inputMode="decimal"
                    maxLength={19}
                    placeholder="Kosong jika belum diketahui"
                    defaultValue={
                      initial?.soldQuantity === null ||
                      initial?.soldQuantity === undefined
                        ? ""
                        : new ExactDecimal(initial.soldQuantity)
                            .toFixed()
                            .replace(".", ",")
                    }
                    {...attributes("soldQuantity")}
                  />
                  {field("soldQuantity")}
                </label>
                <label>
                  Satuan kuantitas
                  <input
                    name="soldUnit"
                    value={order?.unit ?? soldUnit}
                    readOnly={!!order}
                    maxLength={30}
                    placeholder="Contoh: pcs"
                    onChange={(e) => setSoldUnit(e.target.value)}
                    {...attributes("soldUnit")}
                  />
                  {field("soldUnit")}
                </label>
              </div>
              <div className="info-strip">
                <p>
                  Hindari menghitung kuantitas dua kali pada DP dan pelunasan.
                  Contoh pesanan 100 pcs: catat 0 pada DP dan 100 pada
                  pelunasan, atau alokasi sesuai realisasi. Kosong berarti belum
                  diketahui.
                </p>
              </div>
            </>
          )}
        </section>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="order-form-actions">
          <Link
            className="button secondary"
            href="/buku-kas"
            onClick={(e) => {
              if (pending) e.preventDefault();
            }}
          >
            Batal
          </Link>
          <button type="submit" disabled={pending || searching}>
            <Save size={17} />
            {pending ? "Menyimpan…" : "Simpan transaksi"}
          </button>
        </div>
      </form>
    </>
  );
}
