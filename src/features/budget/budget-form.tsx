"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Calculator, Scissors } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import type { CategoryRow } from "@/features/categories/schema";
import type { OrderRow } from "@/features/orders/schema";
import { calculateBudget } from "@/lib/calculations/budget";
import { type MaterialEstimate } from "@/lib/calculations/cutting";
import { ExactDecimal } from "@/lib/money";
import {
  budgetSchema,
  marginModes,
  type BudgetDetail,
  type PaperInput,
  type CostInput,
} from "./schema";
import { CuttingCalculator, emptyPaper } from "./cutting-calculator";
import { CostEditor, type DraftCost } from "./cost-editor";
import { BudgetOrderPicker } from "./order-picker";
import { BudgetTotals } from "./budget-totals";
export function BudgetForm({
  initial,
  initialOrder,
  categories,
}: {
  initial?: BudgetDetail;
  initialOrder?: OrderRow;
  categories: CategoryRow[];
}) {
  const router = useRouter(),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [fields, setFields] = useState<Record<string, string[]>>({});
  const [title, setTitle] = useState(initial?.title ?? ""),
    [quantity, setQuantity] = useState(
      initial
        ? new ExactDecimal(initial.quantity).toFixed().replace(".", ",")
        : "",
    ),
    [unit, setUnit] = useState(initial?.unit ?? "pcs");
  const [order, setOrder] = useState<OrderRow | null>(initialOrder ?? null),
    [categoryId, setCategoryId] = useState(initial?.categoryId ?? ""),
    [subId, setSubId] = useState(initial?.subcategoryId ?? "");
  const [mode, setMode] = useState<BudgetDetail["marginMode"]>(
      initial?.marginMode ?? "PERCENT_MARKUP",
    ),
    [margin, setMargin] = useState(
      initial?.marginValue.replace(".", ",") ?? "0",
    );
  const [items, setItems] = useState<DraftCost[]>(
    () =>
      initial?.items.map((item) => ({
        key: item.id,
        label: item.label,
        costType: item.costType,
        quantity: item.quantity,
        unitCost: item.unitCost,
        fromPaperCut: item.fromPaperCut,
      })) ?? [],
  );
  const [paper, setPaper] = useState<PaperInput | null>(
    initial?.paperCut ?? null,
  );
  const preview = useMemo(() => {
    try {
      return {
        totals: calculateBudget({
          quantity,
          items,
          marginMode: mode,
          marginValue: margin,
        }),
        error: "",
      };
    } catch (error) {
      return {
        totals: null,
        error:
          error instanceof Error ? error.message : "Periksa komponen biaya.",
      };
    }
  }, [quantity, items, mode, margin]);
  const roots = categories.filter(
      (c) =>
        !c.parentId &&
        (c.isActive ||
          c.id === initial?.categoryId ||
          c.id === order?.categoryId),
    ),
    children = categories.filter(
      (c) =>
        c.parentId === categoryId &&
        (c.isActive ||
          c.id === initial?.subcategoryId ||
          c.id === order?.subcategoryId),
    );
  function field(name: string) {
    return (
      fields[name] && (
        <small className="field-error order-field-error">
          {fields[name].join(" ")}
        </small>
      )
    );
  }
  function manual() {
    setItems((current) =>
      current.map((item) => ({ ...item, fromPaperCut: false })),
    );
  }
  function applyMaterial(material: MaterialEstimate) {
    const next: CostInput = {
      label: "Bahan kertas dari simulasi potong",
      costType: "PAPER",
      quantity: material.requiredParentSheets,
      unitCost: material.paperPricePerSheet,
      fromPaperCut: true,
    };
    setItems((current) => {
      const index = current.findIndex((i) => i.fromPaperCut);
      return index < 0
        ? [...current, { ...next, key: crypto.randomUUID() }]
        : current.map((item, i) =>
            i === index ? { ...next, key: item.key, label: item.label } : item,
          );
    });
    setNotice(
      "Biaya bahan diterapkan. Konfirmasi berikutnya memperbarui baris yang sama.",
    );
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setFields({});
    const labels = form.getAll("itemLabel"),
      types = form.getAll("itemCostType"),
      quantities = form.getAll("itemQuantity"),
      costs = form.getAll("itemUnitCost"),
      sources = form.getAll("itemSource");
    const data = {
      title: form.get("title"),
      quantity: form.get("quantity"),
      unit: form.get("unit"),
      orderId: form.get("orderId") || null,
      categoryId: form.get("categoryId"),
      subcategoryId: form.get("subcategoryId") || null,
      marginMode: form.get("marginMode"),
      marginValue: form.get("marginValue"),
      items: labels.map((label, index) => ({
        label,
        costType: types[index],
        quantity: quantities[index],
        unitCost: costs[index],
        fromPaperCut: sources[index] === "true",
      })),
      paperCut: paper,
    };
    const parsed = budgetSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      setFields(
        Object.fromEntries(
          Object.entries(parsed.error.flatten().fieldErrors).filter(
            ([, v]) => v,
          ),
        ),
      );
      return;
    }
    setPending(true);
    try {
      const response = await fetch(
        initial ? `/api/budgets/${initial.id}` : "/api/budgets",
        {
          method: initial ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            initial
              ? { data: parsed.data, updatedAt: initial.updatedAt }
              : parsed.data,
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
      router.push(
        `/budgeting/${value.budget.id}?notice=${initial ? "updated" : "created"}`,
      );
      router.refresh();
    } catch {
      setError(
        "Koneksi terputus. Periksa riwayat sebelum mencoba menyimpan kembali agar estimasi tidak tersimpan dua kali.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Link className="back-link" href="/budgeting">
        <ArrowLeft size={16} />
        Riwayat budgeting
      </Link>
      <PageHeading
        eyebrow="ESTIMASI PRODUKSI"
        title={initial ? "Ubah Estimasi HPP" : "Buat Estimasi HPP"}
        description="Hitung biaya produksi, pola potong, dan rekomendasi harga. Menyimpan estimasi tidak mencatat pengeluaran kas."
      />
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button className="text-button" onClick={() => setNotice("")}>
            Tutup
          </button>
        </div>
      )}
      <form
        className="order-form budget-form"
        onSubmit={submit}
        aria-busy={pending}
      >
        <fieldset className="budget-form-fields" disabled={pending}>
          <section className="panel order-form-panel">
            <div className="order-section-title">
              <span>01</span>
              <div>
                <h2>Detail estimasi</h2>
                <p>Pilih produk dan jumlah yang ingin dihitung biayanya.</p>
              </div>
            </div>
            <label>
              Judul estimasi
              <input
                name="title"
                value={title}
                required
                maxLength={150}
                placeholder="Contoh: Cetak brosur promosi 100 pcs"
                onChange={(e) => setTitle(e.target.value)}
                aria-invalid={!!fields.title}
              />
              {field("title")}
            </label>
            <BudgetOrderPicker
              order={order}
              disabled={pending}
              onChange={(row) => {
                setOrder(row);
                if (row) {
                  setCategoryId(row.categoryId);
                  setSubId(row.subcategoryId ?? "");
                  setQuantity(
                    new ExactDecimal(row.quantity).toFixed().replace(".", ","),
                  );
                  setUnit(row.unit);
                }
              }}
            />
            {initial?.orderNumberSnapshot && !order && (
              <p className="order-history-note">
                Riwayat pesanan: {initial.orderNumberSnapshot} ·{" "}
                {initial.customerNameSnapshot}. Tautan pesanan tidak aktif.
              </p>
            )}
            {field("orderId")}
            <div className="form-columns">
              <label>
                Kategori produk
                <select
                  name="categoryId"
                  required
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    setSubId("");
                    setOrder(null);
                  }}
                  aria-invalid={!!fields.categoryId}
                >
                  <option value="">Pilih kategori utama</option>
                  {roots.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.isActive ? "" : " (arsip)"}
                    </option>
                  ))}
                </select>
                {field("categoryId")}
              </label>
              <label>
                Subkategori (opsional)
                <select
                  name="subcategoryId"
                  value={subId}
                  disabled={!categoryId || !children.length}
                  onChange={(e) => {
                    setSubId(e.target.value);
                    setOrder(null);
                  }}
                  aria-invalid={!!fields.subcategoryId}
                >
                  <option value="">Tanpa subkategori</option>
                  {children.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.isActive ? "" : " (arsip)"}
                    </option>
                  ))}
                </select>
                {field("subcategoryId")}
              </label>
              <label>
                Jumlah produk estimasi
                <input
                  name="quantity"
                  inputMode="decimal"
                  value={quantity}
                  required
                  maxLength={19}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="100"
                  aria-invalid={!!fields.quantity}
                />
                {field("quantity")}
              </label>
              <label>
                Satuan produk
                <input
                  name="unit"
                  required
                  maxLength={30}
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="pcs / lembar / meter"
                  aria-invalid={!!fields.unit}
                />
                {field("unit")}
              </label>
            </div>
            {initial?.productNameSnapshot && (
              <p className="order-history-note">
                Produk saat estimasi disimpan: {initial.productNameSnapshot}.
                Nama historis dipertahankan jika kategori tidak diganti.
              </p>
            )}
          </section>
          <section className="panel order-form-panel" id="simulasi-potong">
            <div className="order-section-title">
              <span>02</span>
              <div>
                <h2>
                  <Scissors size={18} /> Simulasi potong kertas
                </h2>
                <p>
                  Bandingkan orientasi asli dan diputar dengan grid satu
                  orientasi.
                </p>
              </div>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!!paper}
                onChange={(e) => {
                  if (e.target.checked) setPaper(emptyPaper());
                  else {
                    setPaper(null);
                    manual();
                    setNotice(
                      "Simulasi dilepas. Biaya bahan yang sudah diterapkan tetap ada sebagai komponen manual.",
                    );
                  }
                }}
              />
              Sertakan simulasi potong pada estimasi
            </label>
            {paper && (
              <CuttingCalculator
                value={paper}
                onChange={setPaper}
                onApply={applyMaterial}
                appliedItem={items.find((i) => i.fromPaperCut)}
                onManual={manual}
                productQuantity={quantity}
                disabled={pending}
              />
            )}
            {field("paperCut")}
          </section>
          <section className="panel order-form-panel">
            <div className="order-section-title">
              <span>03</span>
              <div>
                <h2>Komponen biaya produksi</h2>
                <p>
                  Tambahkan, ubah, atau hapus sesuai kebutuhan. Harga berupa
                  Rupiah utuh tanpa pemisah ribuan.
                </p>
              </div>
            </div>
            <CostEditor items={items} onChange={setItems} disabled={pending} />
            {field("items")}
          </section>
          <section className="panel order-form-panel">
            <div className="order-section-title">
              <span>04</span>
              <div>
                <h2>
                  <Calculator size={18} /> HPP dan rekomendasi harga
                </h2>
                <p>
                  Keuntungan ditambahkan di atas HPP, bukan margin terhadap
                  harga jual.
                </p>
              </div>
            </div>
            <div className="form-columns">
              <label>
                Mode keuntungan
                <select
                  name="marginMode"
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value as typeof mode);
                    setMargin("0");
                  }}
                >
                  {Object.entries(marginModes).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {mode === "PERCENT_MARKUP"
                  ? "Keuntungan di atas HPP (%)"
                  : "Keuntungan total (Rp)"}
                <input
                  name="marginValue"
                  inputMode={mode === "PERCENT_MARKUP" ? "decimal" : "numeric"}
                  required
                  maxLength={21}
                  value={margin}
                  onChange={(e) => setMargin(e.target.value)}
                  aria-invalid={!!fields.marginValue}
                />
                {field("marginValue")}
              </label>
            </div>
            <BudgetTotals totals={preview.totals} quantity={quantity} />
            {preview.error && (
              <p className="alert" role="status">
                {preview.error}
              </p>
            )}
            <p className="budget-hint">
              Per-unit merupakan perkiraan ditampilkan dua desimal. Harga total
              dibulatkan ke Rupiah utuh. Angka dihitung ulang di server saat
              disimpan.
            </p>
          </section>
        </fieldset>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="order-form-actions">
          <Link
            className="button secondary"
            href={initial ? `/budgeting/${initial.id}` : "/budgeting"}
            onClick={(e) => {
              if (pending) e.preventDefault();
            }}
          >
            Batal
          </Link>
          <button type="submit" disabled={pending}>
            <Save size={17} />
            {pending ? "Menyimpan…" : "Simpan estimasi"}
          </button>
        </div>
      </form>
    </>
  );
}
