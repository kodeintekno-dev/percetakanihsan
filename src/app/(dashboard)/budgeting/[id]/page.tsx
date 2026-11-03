import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Scissors } from "lucide-react";
import { requirePageAdmin } from "@/lib/auth/session";
import { AppError } from "@/lib/app-error";
import { PageHeading } from "@/components/page-heading";
import { getBudget } from "@/features/budget/service";
import { costTypes, marginModes } from "@/features/budget/schema";
import { SavedCutPreview } from "@/features/budget/cutting-calculator";
import { BudgetTotals } from "@/features/budget/budget-totals";
import { BudgetDeleteButton } from "@/features/budget/budget-delete";
import { displayInstant } from "@/features/budget/format";
import { formatRupiah, formatQuantity, ExactDecimal } from "@/lib/money";
export default async function BudgetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageAdmin();
  const data = await getBudget((await params).id).catch((error) => {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  });
  const query = await searchParams;
  const totals = {
    lineTotals: data.items.map((i) => i.totalCost),
    totalHpp: data.totalHpp,
    hppPerUnit: data.hppPerUnit,
    profitTotal: new ExactDecimal(data.suggestedSellingTotal)
      .sub(data.totalHpp)
      .toFixed(0),
    suggestedSellingTotal: data.suggestedSellingTotal,
    suggestedSellingPerUnit: data.suggestedSellingPerUnit,
  };
  return (
    <>
      <Link className="back-link" href="/budgeting">
        <ArrowLeft size={16} />
        Riwayat budgeting
      </Link>
      <PageHeading
        eyebrow={data.budgetNumber}
        title={data.title}
        description={`Dibuat ${displayInstant(data.createdAt)} · Diperbarui ${displayInstant(data.updatedAt)}`}
        action={
          <Link className="button" href={`/budgeting/${data.id}/edit`}>
            <Pencil size={17} />
            Ubah estimasi
          </Link>
        }
      />
      {(query.notice === "created" || query.notice === "updated") && (
        <div className="toast" role="status">
          Estimasi berhasil{" "}
          {query.notice === "created" ? "disimpan" : "diperbarui"}. Tidak ada
          transaksi kas yang dibuat.
        </div>
      )}
      <section className="panel order-form-panel">
        <h2>Ringkasan estimasi</h2>
        <dl className="budget-detail-meta">
          <div>
            <dt>Produk</dt>
            <dd>
              {data.productNameSnapshot ?? "Tidak tersedia"}
              {data.subcategoryId && <small>{data.categoryNameSnapshot}</small>}
            </dd>
          </div>
          <div>
            <dt>Jumlah produk</dt>
            <dd>
              {formatQuantity(data.quantity)} {data.unit}
            </dd>
          </div>
          <div>
            <dt>Pesanan saat estimasi</dt>
            <dd>
              {data.orderNumberSnapshot ? (
                <>
                  {data.customerNameSnapshot}
                  <small>{data.orderNumberSnapshot}</small>
                  {data.orderId ? (
                    <Link
                      className="text-button"
                      href={`/permintaan/${data.orderId}/edit`}
                    >
                      Buka pesanan
                    </Link>
                  ) : (
                    <small>
                      Tautan pesanan tidak aktif; histori tetap tersimpan.
                    </small>
                  )}
                </>
              ) : (
                "Tidak ditautkan"
              )}
            </dd>
          </div>
          <div>
            <dt>{marginModes[data.marginMode]}</dt>
            <dd>
              {data.marginMode === "PERCENT_MARKUP"
                ? `${formatQuantity(data.marginValue)}%`
                : formatRupiah(data.marginValue)}
            </dd>
          </div>
        </dl>
        <BudgetTotals totals={totals} quantity={data.quantity} />
        <p className="budget-hint">
          Nilai per-unit ditampilkan dua desimal sebagai perkiraan. Rekomendasi
          tidak mengubah harga pesanan atau mencatat kas.
        </p>
      </section>
      <section className="panel order-form-panel">
        <h2>Komponen biaya tersimpan</h2>
        {data.items.length ? (
          <div className="budget-detail-costs">
            {data.items.map((item, index) => (
              <article key={item.id}>
                <div>
                  <span className="tag">{index + 1}</span>
                  <div>
                    <strong>{item.label}</strong>
                    <small>
                      {costTypes[item.costType]}
                      {item.fromPaperCut ? " · Dari hasil potong" : " · Manual"}
                    </small>
                    <small>
                      {formatQuantity(item.quantity)} ×{" "}
                      {formatRupiah(item.unitCost)}
                    </small>
                  </div>
                </div>
                <strong>{formatRupiah(item.totalCost)}</strong>
              </article>
            ))}
          </div>
        ) : (
          <p className="budget-hint">
            Estimasi ini belum memiliki komponen biaya; HPP bernilai Rp0.
          </p>
        )}
      </section>
      {data.paperSnapshot ? (
        <section className="panel order-form-panel">
          <h2>
            <Scissors size={18} /> Snapshot potong kertas
          </h2>
          <p className="budget-hint">
            Plano{" "}
            {formatQuantity(data.paperSnapshot.calculation.input.sheetLengthCm)}{" "}
            ×{" "}
            {formatQuantity(data.paperSnapshot.calculation.input.sheetWidthCm)}{" "}
            cm · Potongan{" "}
            {formatQuantity(data.paperSnapshot.calculation.input.cutLengthCm)} ×{" "}
            {formatQuantity(data.paperSnapshot.calculation.input.cutWidthCm)} cm
          </p>
          {data.legacySnapshot && (
            <div className="alert">
              Snapshot format lama: hasil ditampilkan dengan perhitungan ulang
              parameter tersimpan. Simpan ulang estimasi untuk mencatat snapshot
              lengkap.
            </div>
          )}
          <SavedCutPreview snapshot={data.paperSnapshot} />
        </section>
      ) : (
        <section className="panel order-form-panel">
          <h2>Simulasi potong</h2>
          <p className="budget-hint">
            Tidak ada simulasi potong yang disimpan pada estimasi ini.
          </p>
        </section>
      )}
      <div className="budget-detail-actions">
        <Link className="button secondary" href="/budgeting">
          Kembali ke riwayat
        </Link>
        <BudgetDeleteButton budget={data} />
      </div>
      <p className="budget-hint">
        Estimasi HPP adalah perencanaan. Catat pengeluaran nyata melalui Buku
        Kas ketika uang benar-benar dibayar.
      </p>
    </>
  );
}
