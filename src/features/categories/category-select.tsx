"use client";
import { useState } from "react";
import { cascadingOptions, type CategoryRow } from "./schema";
export function CategorySelect({ rows }: { rows: CategoryRow[] }) {
  const [parentId, setParentId] = useState("");
  const [subId, setSubId] = useState("");
  const children = cascadingOptions(rows, parentId);
  return (
    <section className="panel cascading-panel">
      <h2>Coba pilihan bertingkat</h2>
      <p className="muted">
        Pratinjau kategori aktif untuk formulir permintaan dan budgeting pada
        tahap berikutnya.
      </p>
      <div className="form-columns">
        <label>
          Kategori utama
          <select
            value={parentId}
            onChange={(e) => {
              setParentId(e.target.value);
              setSubId("");
            }}
          >
            <option value="">Pilih kategori utama</option>
            {rows
              .filter((r) => !r.parentId && r.isActive)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Subkategori
          <select
            value={subId}
            disabled={!parentId || !children.length}
            onChange={(e) => setSubId(e.target.value)}
          >
            <option value="">
              {!parentId
                ? "Pilih kategori utama dahulu"
                : children.length
                  ? "Pilih subkategori"
                  : "Belum ada subkategori aktif"}
            </option>
            {children.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
