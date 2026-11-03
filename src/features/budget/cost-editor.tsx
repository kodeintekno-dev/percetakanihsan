"use client";
import { Plus, Trash2 } from "lucide-react";
import { costTypes, type CostInput } from "./schema";
import { orderTotal, formatRupiah } from "@/lib/money";
import { positiveQuantity, wholeCost } from "@/lib/calculations/budget";
export type DraftCost = CostInput & { key: string };
export function CostEditor({
  items,
  onChange,
  disabled,
}: {
  items: DraftCost[];
  onChange: (items: DraftCost[]) => void;
  disabled: boolean;
}) {
  function update(index: number, patch: Partial<CostInput>) {
    onChange(
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }
  return (
    <div className="budget-cost-editor">
      {!items.length && (
        <div className="budget-empty-cost">
          <p>
            Belum ada komponen biaya. Tambahkan biaya riil yang ingin
            diestimasi; total sementara Rp0.
          </p>
        </div>
      )}
      {items.map((item, index) => {
        let total: string | null = null;
        try {
          total = orderTotal(
            positiveQuantity(item.quantity),
            wholeCost(item.unitCost),
          );
        } catch {
          /* Baris belum valid ditampilkan tanpa subtotal lama. */
        }
        return (
          <fieldset
            className="budget-cost-row"
            key={item.key}
            disabled={disabled}
          >
            <legend>Komponen {index + 1}</legend>
            <div className="budget-cost-top">
              <label>
                Nama komponen
                <input
                  name="itemLabel"
                  required
                  maxLength={150}
                  value={item.label}
                  placeholder="Contoh: Tinta dan cetak"
                  onChange={(e) => update(index, { label: e.target.value })}
                />
              </label>
              <label>
                Jenis biaya
                <select
                  name="itemCostType"
                  value={item.costType}
                  onChange={(e) =>
                    update(index, {
                      costType: e.target.value as CostInput["costType"],
                      fromPaperCut: false,
                    })
                  }
                >
                  {Object.entries(costTypes).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="icon-button danger-text"
                aria-label={`Hapus komponen ${index + 1}`}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                <Trash2 size={17} />
              </button>
            </div>
            <div className="budget-cost-values">
              <label>
                Jumlah biaya
                <input
                  name="itemQuantity"
                  required
                  inputMode="decimal"
                  maxLength={19}
                  value={item.quantity}
                  readOnly={item.fromPaperCut}
                  onChange={(e) =>
                    update(index, {
                      quantity: e.target.value,
                      fromPaperCut: false,
                    })
                  }
                />
              </label>
              <label>
                Harga satuan biaya (Rp)
                <input
                  name="itemUnitCost"
                  required
                  inputMode="numeric"
                  maxLength={18}
                  value={item.unitCost}
                  readOnly={item.fromPaperCut}
                  onChange={(e) =>
                    update(index, {
                      unitCost: e.target.value,
                      fromPaperCut: false,
                    })
                  }
                />
              </label>
              <div className="budget-subtotal">
                <small>Subtotal</small>
                <output>{total !== null ? formatRupiah(total) : "—"}</output>
              </div>
            </div>
            <input
              type="hidden"
              name="itemSource"
              value={String(item.fromPaperCut)}
            />
            {item.fromPaperCut && (
              <div className="budget-source-note">
                <span>Biaya dari hasil potong yang dikonfirmasi.</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => update(index, { fromPaperCut: false })}
                >
                  Jadikan manual untuk mengubah angka
                </button>
              </div>
            )}
          </fieldset>
        );
      })}
      <button
        type="button"
        className="button secondary"
        disabled={disabled}
        onClick={() =>
          onChange([
            ...items,
            {
              key: crypto.randomUUID(),
              label: "",
              costType: "CUSTOM",
              quantity: "1",
              unitCost: "",
              fromPaperCut: false,
            },
          ])
        }
      >
        <Plus size={17} />
        Tambah komponen biaya
      </button>
      <p className="budget-hint">
        Jumlah boleh tiga desimal. Subtotal setiap baris dibulatkan ke Rupiah
        terdekat (0,5 ke atas), lalu dijumlahkan.
      </p>
    </div>
  );
}
