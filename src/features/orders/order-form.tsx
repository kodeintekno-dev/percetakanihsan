"use client";
import { notifyDataChanged } from "@/lib/notify-data-changed";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Calculator } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import type { CategoryRow } from "@/features/categories/schema";
import { orderStatuses, type OrderRow, type OrderStatus } from "./schema";
import {
  ExactDecimal,
  MAX_RUPIAH,
  formatRupiah,
  orderTotal,
} from "@/lib/money";

export function OrderForm({
  categories,
  today,
  initial,
}: {
  categories: CategoryRow[];
  today: string;
  initial?: OrderRow;
}) {
  const router = useRouter();
  const [data, setData] = useState({
    orderDate: initial?.orderDate ?? today,
    customerName: initial?.customerName ?? "",
    categoryId: initial?.categoryId ?? "",
    subcategoryId: initial?.subcategoryId ?? "",
    quantity: initial
      ? new ExactDecimal(initial.quantity).toFixed().replace(".", ",")
      : "",
    unit: initial?.unit ?? "pcs",
    unitPrice: initial?.unitPrice ?? "",
    status: initial?.status ?? ("NEW" as OrderStatus),
    notes: initial?.notes ?? "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const roots = categories.filter(
    (r) => !r.parentId && (r.isActive || r.id === initial?.categoryId),
  );
  const children = categories.filter(
    (r) =>
      r.parentId === data.categoryId &&
      (r.isActive || r.id === initial?.subcategoryId),
  );
  let total: string | null = null;
  if (
    /^\d{1,15}(?:[.,]\d{1,3})?$/.test(data.quantity) &&
    /^\d{1,18}$/.test(data.unitPrice)
  ) {
    const calculated = orderTotal(data.quantity, data.unitPrice);
    if (
      new ExactDecimal(data.quantity.replace(",", ".")).gt(0) &&
      new ExactDecimal(calculated).lte(MAX_RUPIAH)
    )
      total = calculated;
  }
  const fieldError = (name: string) =>
    fields[name] ? (
      <small id={`${name}-error`} className="field-error order-field-error">
        {fields[name][0]}
      </small>
    ) : null;
  const invalid = (name: string) => ({
    "aria-invalid": !!fields[name],
    "aria-describedby": fields[name] ? `${name}-error` : undefined,
  });
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setFields({});
    const form = new FormData(event.currentTarget);
    const values = {
      ...Object.fromEntries(form),
      subcategoryId: form.get("subcategoryId") || null,
    };
    try {
      const response = await fetch(
        initial ? `/api/orders/${initial.id}` : "/api/orders",
        {
          method: initial ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            initial ? { data: values, updatedAt: initial.updatedAt } : values,
          ),
        },
      );
      const result = await response.json();
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        setError(result.error);
        // Zod nested update envelope mengembalikan errors pada data; route meratakan untuk UX.
        setFields(result.fields ?? {});
        return;
      }
      notifyDataChanged();
      router.push(`/permintaan?notice=${initial ? "updated" : "created"}`);
      router.refresh();
    } catch {
      setError(
        "Koneksi terputus. Permintaan belum dapat disimpan; periksa daftar sebelum mencoba kembali.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Link className="back-link" href="/permintaan">
        <ArrowLeft size={16} />
        Daftar permintaan
      </Link>
      <PageHeading
        eyebrow="PERMINTAAN CETAK"
        title={initial ? "Ubah Permintaan" : "Tambah Permintaan"}
        description={
          initial
            ? `Kode ${initial.orderNumber} · Perbarui detail pekerjaan pelanggan.`
            : "Catat kebutuhan cetak pelanggan. Total dihitung otomatis dalam Rupiah."
        }
      />
      <form onSubmit={submit} className="order-form" aria-busy={pending}>
        <section className="panel order-form-panel">
          <div className="order-section-title">
            <span>01</span>
            <div>
              <h2>Detail pesanan</h2>
              <p>Informasi pelanggan dan produk yang dipesan.</p>
            </div>
          </div>
          <div className="form-columns">
            <label>
              Tanggal pesanan
              <input
                type="date"
                name="orderDate"
                required
                defaultValue={data.orderDate}
                {...invalid("orderDate")}
              />
              {fieldError("orderDate")}
            </label>
            <label>
              Nama pelanggan
              <input
                name="customerName"
                required
                maxLength={150}
                placeholder="Nama pemesan atau instansi"
                value={data.customerName}
                onChange={(e) =>
                  setData({ ...data, customerName: e.target.value })
                }
                {...invalid("customerName")}
              />
              {fieldError("customerName")}
            </label>
            <label>
              Kategori produk
              <select
                name="categoryId"
                required
                value={data.categoryId}
                onChange={(e) =>
                  setData({
                    ...data,
                    categoryId: e.target.value,
                    subcategoryId: "",
                  })
                }
                {...invalid("categoryId")}
              >
                <option value="">Pilih kategori utama</option>
                {roots.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.isActive ? "" : " (diarsipkan)"}
                  </option>
                ))}
              </select>
              {fieldError("categoryId")}
            </label>
            <label>
              Subkategori (opsional)
              <select
                name="subcategoryId"
                value={data.subcategoryId}
                disabled={!data.categoryId || !children.length}
                onChange={(e) =>
                  setData({ ...data, subcategoryId: e.target.value })
                }
                {...invalid("subcategoryId")}
              >
                <option value="">
                  {!data.categoryId
                    ? "Pilih kategori utama dahulu"
                    : children.length
                      ? "Tanpa subkategori"
                      : "Belum ada subkategori"}
                </option>
                {children.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.isActive ? "" : " (diarsipkan)"}
                  </option>
                ))}
              </select>
              {fieldError("subcategoryId")}
            </label>
          </div>
          {!roots.length && (
            <div className="alert">
              Belum ada kategori aktif.{" "}
              <Link href="/kategori-produk">Tambahkan kategori produk</Link>{" "}
              terlebih dahulu.
            </div>
          )}
          {initial && (
            <p className="order-history-note">
              Nama historis tersimpan:{" "}
              <strong>
                {initial.categoryNameSnapshot}
                {initial.subcategoryId
                  ? ` / ${initial.productNameSnapshot}`
                  : ""}
              </strong>
              . Mengedit kategori master tidak mengganti nama historis ini.
            </p>
          )}
        </section>
        <section className="panel order-form-panel">
          <div className="order-section-title">
            <span>02</span>
            <div>
              <h2>Jumlah & harga</h2>
              <p>
                Jumlah boleh maksimal tiga desimal; harga satuan dalam Rupiah
                utuh.
              </p>
            </div>
          </div>
          <div className="order-quantity-grid">
            <label>
              Jumlah
              <input
                name="quantity"
                required
                inputMode="decimal"
                placeholder="Contoh: 250 atau 1,5"
                value={data.quantity}
                onChange={(e) => setData({ ...data, quantity: e.target.value })}
                maxLength={19}
                {...invalid("quantity")}
              />
              {fieldError("quantity")}
            </label>
            <label>
              Satuan
              <input
                name="unit"
                required
                list="order-units"
                maxLength={30}
                value={data.unit}
                onChange={(e) => setData({ ...data, unit: e.target.value })}
                {...invalid("unit")}
              />
              <datalist id="order-units">
                <option value="pcs" />
                <option value="lembar" />
                <option value="meter" />
                <option value="set" />
              </datalist>
              {fieldError("unit")}
            </label>
            <label>
              Harga satuan (Rp)
              <input
                name="unitPrice"
                required
                inputMode="numeric"
                placeholder="Contoh: 2000"
                value={data.unitPrice}
                onChange={(e) =>
                  setData({ ...data, unitPrice: e.target.value })
                }
                maxLength={18}
                {...invalid("unitPrice")}
              />
              {fieldError("unitPrice")}
            </label>
          </div>
          <div className="order-total">
            <span>
              <Calculator size={20} />
              Total permintaan
            </span>
            <output aria-live="polite" aria-label="Total permintaan">
              {total === null ? "—" : formatRupiah(total)}
            </output>
            <small>
              Jumlah × harga satuan · Dibulatkan ke Rupiah terdekat; 0,5
              dibulatkan ke atas.
            </small>
          </div>
        </section>
        <section className="panel order-form-panel">
          <div className="order-section-title">
            <span>03</span>
            <div>
              <h2>Status & catatan</h2>
              <p>Alur pekerjaan: Baru → Diproses → Selesai → Diambil.</p>
            </div>
          </div>
          <div className="form-stack">
            <label>
              Status pekerjaan
              <select
                name="status"
                value={data.status}
                onChange={(e) =>
                  setData({ ...data, status: e.target.value as OrderStatus })
                }
                {...invalid("status")}
              >
                {Object.entries(orderStatuses).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {fieldError("status")}
            </label>
            <label>
              Catatan khusus (opsional)
              <textarea
                name="notes"
                rows={4}
                maxLength={5000}
                placeholder="Ukuran, bahan, finishing, atau tenggat waktu…"
                value={data.notes}
                onChange={(e) => setData({ ...data, notes: e.target.value })}
                {...invalid("notes")}
              />
              {fieldError("notes")}
            </label>
          </div>
        </section>
        <div className="info-strip">
          <p>
            Nilai pesanan belum berarti uang diterima. Menyimpan atau
            menyelesaikan pesanan tidak otomatis menambah kas.
          </p>
        </div>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="order-form-actions">
          <Link
            href="/permintaan"
            className="button secondary"
            aria-disabled={pending}
            onClick={(e) => {
              if (pending) e.preventDefault();
            }}
          >
            Batal
          </Link>
          <button disabled={pending || !roots.length} type="submit">
            <Save size={17} />
            {pending ? "Menyimpan…" : "Simpan permintaan"}
          </button>
        </div>
      </form>
    </>
  );
}
