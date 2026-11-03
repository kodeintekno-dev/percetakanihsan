"use client";
import { useState } from "react";
import { Scissors, ArrowDownToLine, CheckCircle2 } from "lucide-react";
import {
  calculateCutting,
  calculateMaterial,
  dimensionUnits,
  CuttingError,
  type CuttingResult,
  type CutOrientation,
  type MaterialEstimate,
} from "@/lib/calculations/cutting";
import { formatQuantity, formatRupiah, ExactDecimal } from "@/lib/money";
import type { PaperInput, CostInput, PaperSnapshot } from "./schema";
import { CuttingCanvas } from "./cutting-canvas";
const labels = {
  sheetLengthCm: "Panjang plano (cm)",
  sheetWidthCm: "Lebar plano (cm)",
  cutLengthCm: "Panjang potongan (cm)",
  cutWidthCm: "Lebar potongan (cm)",
} as const;
export const emptyPaper = (): PaperInput => ({
  sheetLengthCm: "",
  sheetWidthCm: "",
  cutLengthCm: "",
  cutWidthCm: "",
  selectedOrientation: "original",
  material: null,
});
export function CuttingOutput({
  result,
  orientation,
  onOrientation,
}: {
  result: CuttingResult;
  orientation: CutOrientation;
  onOrientation: (value: CutOrientation) => void;
}) {
  return (
    <>
      <div className="cut-comparison">
        {(["original", "rotated"] as const).map((name) => {
          const grid = result[name],
            best = result.bestOrientation === name;
          return (
            <article
              className={`cut-card ${best ? "cut-best" : ""}`}
              key={name}
            >
              <div className="cut-card-heading">
                <h3>{name === "original" ? "ASLI" : "DIPUTAR 90°"}</h3>
                {best && (
                  <span className="tag">
                    <CheckCircle2 size={12} />
                    {result.tied ? "Hasil seri" : "Terbaik"}
                  </span>
                )}
              </div>
              <strong className="cut-yield">
                {formatQuantity(grid.yield)} <small>potongan / plano</small>
              </strong>
              <p>
                {formatQuantity(grid.columns)} kolom ×{" "}
                {formatQuantity(grid.rows)} baris
              </p>
              <dl>
                <div>
                  <dt>Ukuran potongan</dt>
                  <dd>
                    {formatQuantity(grid.pieceLengthCm)} ×{" "}
                    {formatQuantity(grid.pieceWidthCm)} cm
                  </dd>
                </div>
                <div>
                  <dt>Sisa X / panjang</dt>
                  <dd>{formatQuantity(grid.remainingLengthCm)} cm</dd>
                </div>
                <div>
                  <dt>Sisa Y / lebar</dt>
                  <dd>{formatQuantity(grid.remainingWidthCm)} cm</dd>
                </div>
                <div>
                  <dt>Luas waste</dt>
                  <dd>{formatQuantity(grid.wasteAreaCm2)} cm²</dd>
                </div>
                <div>
                  <dt>Waste (%)</dt>
                  <dd>{grid.wastePercentRounded2.replace(".", ",")}%</dd>
                </div>
              </dl>
              <button
                type="button"
                className={`button ${orientation === name ? "" : "secondary"}`}
                aria-pressed={orientation === name}
                onClick={() => onOrientation(name)}
              >
                Preview {name === "original" ? "asli" : "diputar"}
              </button>
            </article>
          );
        })}
      </div>
      <div className="cut-recommendation">
        <Scissors size={19} />
        <p>
          <strong>
            {result.tied
              ? "Hasil seri; orientasi asli direkomendasikan."
              : `Rekomendasi: ${result.bestOrientation === "original" ? "asli" : "diputar"}, ${formatQuantity(result[result.bestOrientation].yield)} potongan per plano.`}
          </strong>
          <span>
            Grid satu orientasi, pembulatan ke bawah pada setiap sumbu.
          </span>
        </p>
      </div>
      {result[orientation].yield === "0" && (
        <div className="alert" role="status">
          Ukuran potongan tidak muat pada plano untuk orientasi ini. Seluruh
          luas plano menjadi waste; pemindahan biaya bahan diblokir.
        </div>
      )}
      <div className="cut-preview-title">
        <h3>Skema {orientation === "original" ? "asli" : "diputar"}</h3>
        <span>
          Rasio plano {formatQuantity(result.input.sheetLengthCm)} :{" "}
          {formatQuantity(result.input.sheetWidthCm)}
        </span>
      </div>
      <CuttingCanvas result={result} orientation={orientation} />
    </>
  );
}
export function CuttingCalculator({
  value,
  onChange,
  onApply,
  appliedItem,
  onManual,
  productQuantity,
  disabled = false,
}: {
  value: PaperInput;
  onChange: (value: PaperInput) => void;
  onApply: (value: MaterialEstimate) => void;
  appliedItem?: CostInput;
  onManual: () => void;
  productQuantity: string;
  disabled?: boolean;
}) {
  let result: CuttingResult | null = null,
    calculationError = "",
    material: MaterialEstimate | null = null,
    materialError = "";
  try {
    result = calculateCutting(value);
  } catch (error) {
    calculationError =
      error instanceof CuttingError ? error.message : "Periksa ukuran potong.";
  }
  if (result && value.material)
    try {
      material = calculateMaterial(
        result,
        value.selectedOrientation,
        value.material.requiredFinishedPieces,
        value.material.paperPricePerSheet,
      );
    } catch (error) {
      materialError =
        error instanceof CuttingError
          ? error.message
          : "Periksa jumlah dan harga plano.";
    }
  const stale =
    !!appliedItem &&
    (!material ||
      !new ExactDecimal(appliedItem.quantity || "NaN").eq(
        material.requiredParentSheets,
      ) ||
      !new ExactDecimal(appliedItem.unitCost || "NaN").eq(
        material.paperPricePerSheet,
      ));
  function dimensionChange(key: keyof typeof labels, next: string) {
    const draft = { ...value, [key]: next };
    try {
      draft.selectedOrientation = calculateCutting(draft).bestOrientation;
    } catch {
      /* Hasil lama tidak ditampilkan saat ukuran belum valid. */
    }
    onChange(draft);
  }
  function openMaterial() {
    let qty = "";
    try {
      if (new ExactDecimal(productQuantity.replace(",", ".")).isInteger())
        qty = new ExactDecimal(productQuantity.replace(",", ".")).toFixed(0);
    } catch {
      /* Input jumlah dapat belum lengkap. */
    }
    onChange({
      ...value,
      material: { requiredFinishedPieces: qty, paperPricePerSheet: "" },
    });
  }
  return (
    <fieldset className="cut-calculator" disabled={disabled}>
      <legend className="sr-only">Kalkulator potong kertas</legend>
      <div className="cut-input-heading">
        <p>Ukuran cm, maksimal dua desimal. Contoh 20,5.</p>
        <button
          type="button"
          className="text-button"
          onClick={() =>
            onChange({
              sheetLengthCm: "107",
              sheetWidthCm: "80",
              cutLengthCm: "26",
              cutWidthCm: "20,5",
              selectedOrientation: "rotated",
              material: value.material,
            })
          }
        >
          Isi contoh 107 × 80
        </button>
      </div>
      <div className="cut-dimensions">
        {Object.entries(labels).map(([raw, label]) => {
          const key = raw as keyof typeof labels;
          let invalid = false;
          try {
            dimensionUnits(value[key]);
          } catch {
            invalid = value[key] !== "";
          }
          return (
            <label key={key}>
              {label}
              <input
                inputMode="decimal"
                maxLength={13}
                required
                value={value[key]}
                onChange={(e) => dimensionChange(key, e.target.value)}
                aria-invalid={invalid}
                placeholder={
                  key === "cutWidthCm"
                    ? "20,5"
                    : key === "sheetLengthCm"
                      ? "107"
                      : key === "sheetWidthCm"
                        ? "80"
                        : "26"
                }
              />
              {invalid && (
                <small className="field-error order-field-error">
                  Isi cm positif, maksimal dua desimal.
                </small>
              )}
            </label>
          );
        })}
      </div>
      {result ? (
        <CuttingOutput
          result={result}
          orientation={value.selectedOrientation}
          onOrientation={(selectedOrientation) =>
            onChange({ ...value, selectedOrientation })
          }
        />
      ) : (
        <div className="cut-empty" role="status">
          <Scissors size={25} />
          <strong>Isi empat ukuran untuk melihat pola potong</strong>
          <p>
            {calculationError} Hasil dan gambar tidak ditampilkan sampai semua
            ukuran valid.
          </p>
        </div>
      )}
      {!value.material ? (
        <button
          type="button"
          className="button secondary"
          disabled={!result || result[value.selectedOrientation].yield === "0"}
          onClick={openMaterial}
        >
          <ArrowDownToLine size={17} />
          Gunakan untuk biaya bahan
        </button>
      ) : (
        <section className="cut-material">
          <div className="cut-material-heading">
            <div>
              <h3>Gunakan untuk biaya bahan</h3>
              <p>
                Orientasi dipilih:{" "}
                {value.selectedOrientation === "original" ? "asli" : "diputar"}.
                Belum mengubah komponen sebelum konfirmasi.
              </p>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() => onChange({ ...value, material: null })}
            >
              Tutup opsi bahan
            </button>
          </div>
          <div className="form-columns">
            <label>
              Jumlah produk yang dipotong
              <input
                inputMode="numeric"
                required
                value={value.material.requiredFinishedPieces}
                maxLength={15}
                onChange={(e) =>
                  onChange({
                    ...value,
                    material: {
                      ...value.material!,
                      requiredFinishedPieces: e.target.value,
                    },
                  })
                }
                placeholder="100"
              />
            </label>
            <label>
              Harga per plano (Rp)
              <input
                inputMode="numeric"
                required
                value={value.material.paperPricePerSheet}
                maxLength={18}
                onChange={(e) =>
                  onChange({
                    ...value,
                    material: {
                      ...value.material!,
                      paperPricePerSheet: e.target.value,
                    },
                  })
                }
                placeholder="10000"
              />
            </label>
          </div>
          {material ? (
            <div className="cut-material-result">
              <p>
                <strong>
                  {formatQuantity(material.requiredParentSheets)} lembar plano
                </strong>{" "}
                · Biaya {formatRupiah(material.totalCost)} · Kelebihan{" "}
                {formatQuantity(material.extraPieces)} potongan
              </p>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onApply(material)}
              >
                <ArrowDownToLine size={16} />
                {appliedItem
                  ? "Konfirmasi pembaruan biaya bahan"
                  : "Konfirmasi biaya bahan"}
              </button>
            </div>
          ) : (
            <p className="alert" role="status">
              {materialError}
            </p>
          )}
        </section>
      )}
      {appliedItem && (
        <div className={`alert ${stale ? "error" : ""}`} role="status">
          {stale
            ? "Komponen bahan belum sesuai simulasi sekarang. Konfirmasi ulang, jadikan manual, atau hapus komponen sebelum menyimpan."
            : "Biaya hasil potong telah diterapkan ke satu komponen bahan. Konfirmasi ulang mengganti baris yang sama."}
          <button type="button" className="text-button" onClick={onManual}>
            Jadikan biaya manual
          </button>
        </div>
      )}
    </fieldset>
  );
}
export function SavedCutPreview({ snapshot }: { snapshot: PaperSnapshot }) {
  const [orientation, setOrientation] = useState(snapshot.selectedOrientation);
  return (
    <>
      <p className="budget-hint">
        Orientasi disimpan:{" "}
        <strong>
          {snapshot.selectedOrientation === "original" ? "asli" : "diputar"}
        </strong>
        . Preview di bawah tidak mengubah snapshot.
      </p>
      <CuttingOutput
        result={snapshot.calculation}
        orientation={orientation}
        onOrientation={setOrientation}
      />
      {snapshot.material && (
        <div className="info-strip">
          <p>
            Perhitungan bahan tersimpan:{" "}
            {formatQuantity(snapshot.material.requiredFinishedPieces)} produk,{" "}
            {formatQuantity(snapshot.material.requiredParentSheets)} plano ×{" "}
            {formatRupiah(snapshot.material.paperPricePerSheet)} ={" "}
            <strong>{formatRupiah(snapshot.material.totalCost)}</strong>,
            kelebihan {formatQuantity(snapshot.material.extraPieces)} potongan.
          </p>
        </div>
      )}
    </>
  );
}
