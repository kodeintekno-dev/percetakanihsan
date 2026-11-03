"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Tags,
  Shapes,
  CornerDownRight,
  Archive,
} from "lucide-react";
import { PageHeading } from "./page-heading";
import { Modal } from "./modal";
import { CategorySelect } from "@/features/categories/category-select";
import type { CategoryRow } from "@/features/categories/schema";
import { expenseGroups, type ExpenseRow } from "@/features/expenses/schema";

type Row = CategoryRow | ExpenseRow;
type Editor = {
  id?: string;
  name: string;
  parentId: string | null;
  group: keyof typeof expenseGroups;
  isActive: boolean;
};
export function MasterManager({
  kind,
  rows,
}: {
  kind: "category" | "expense";
  rows: Row[];
}) {
  const router = useRouter();
  const category = kind === "category";
  const categories = rows as CategoryRow[];
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("active");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const endpoint = category ? "/api/categories" : "/api/expense-posts";
  const label = category ? "Kategori" : "Pos pengeluaran";
  function open(row?: Row, parentId: string | null = null) {
    setFields({});
    setError("");
    setEditor({
      id: row?.id,
      name: row?.name ?? "",
      parentId: row && "parentId" in row ? row.parentId : parentId,
      group: row && "group" in row ? row.group : "PRODUCTION",
      isActive: row?.isActive ?? true,
    });
  }
  async function mutate(method: string, id?: string, body?: unknown) {
    setPending(true);
    setError("");
    setFields({});
    try {
      const response = await fetch(
        `${endpoint}${id ? `/${encodeURIComponent(id)}` : ""}`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      const result = await response.json();
      if (response.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }
      if (!response.ok) {
        setError(result.error);
        setFields(result.fields ?? {});
        return;
      }
      setMessage(result.message);
      setEditor(null);
      setDeleting(null);
      router.refresh();
    } catch {
      setError("Koneksi terputus. Data belum dapat disimpan; coba kembali.");
    } finally {
      setPending(false);
    }
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!editor) return;
    void mutate(editor.id ? "PATCH" : "POST", editor.id, {
      name: editor.name,
      isActive: editor.isActive,
      ...(category ? { parentId: editor.parentId } : { group: editor.group }),
    });
  }
  const matches = (row: Row) =>
    (filter === "all" || row.isActive === (filter === "active")) &&
    row.name
      .toLocaleLowerCase("id-ID")
      .includes(query.toLocaleLowerCase("id-ID"));
  const filtered = category
    ? categories
        .filter(
          (r) =>
            !r.parentId &&
            (matches(r) ||
              categories.some((c) => c.parentId === r.id && matches(c))),
        )
        .flatMap((root) => [
          root,
          ...categories.filter((c) => c.parentId === root.id && matches(c)),
        ])
    : rows.filter(matches);
  const count = rows.filter(matches).length;
  function renderRow(row: Row) {
    const sub = "parentId" in row && !!row.parentId;
    return (
      <div className={`master-row ${sub ? "child-row" : ""}`} key={row.id}>
        <div className="master-name">
          {sub ? (
            <CornerDownRight size={17} />
          ) : (
            <span className={`row-icon ${category ? "" : "peach"}`}>
              {category ? <Tags size={18} /> : <Shapes size={18} />}
            </span>
          )}
          <div>
            <strong>{row.name}</strong>
            <small>
              {category
                ? sub
                  ? "Subkategori · Level 2"
                  : "Kategori utama · Level 1"
                : expenseGroups[(row as ExpenseRow).group]}
              {row.usage > 0 && ` · ${row.usage} referensi tersimpan`}
            </small>
          </div>
        </div>
        <span className={`tag ${row.isActive ? "active-tag" : "archive-tag"}`}>
          {row.isActive ? "Aktif" : "Diarsipkan"}
        </span>
        <div className="row-actions">
          {category && !sub && row.isActive && (
            <button
              className="text-button add-child"
              onClick={() => open(undefined, row.id)}
              aria-label={`Tambah subkategori ${row.name}`}
            >
              <Plus size={15} />
              <span>Subkategori</span>
            </button>
          )}
          <button
            className="icon-button"
            onClick={() => open(row)}
            aria-label={`Ubah ${row.name}`}
            title="Ubah"
          >
            <Pencil size={17} />
          </button>
          <button
            className="icon-button danger-text"
            onClick={() => {
              setError("");
              setDeleting(row);
            }}
            aria-label={`Hapus ${row.name}`}
            title="Hapus atau arsipkan"
          >
            <Trash2 size={17} />
          </button>
        </div>
      </div>
    );
  }
  return (
    <>
      <PageHeading
        eyebrow="MASTER DATA"
        title={category ? "Kategori Produk & Jasa" : "Pos Pengeluaran"}
        description={
          category
            ? "Kelompokkan layanan cetak dalam kategori utama dan subkategori."
            : "Susun pos biaya agar pencatatan pengeluaran lebih terarah."
        }
        action={
          <button onClick={() => open()}>
            <Plus size={18} />
            Tambah {category ? "kategori" : "pos"}
          </button>
        }
      />
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          <button
            className="text-button"
            onClick={() => setMessage("")}
            aria-label="Tutup notifikasi"
          >
            Tutup
          </button>
        </div>
      )}
      <div className="info-strip">
        <Archive size={18} />
        <p>
          {category
            ? "Kategori yang sudah dipakai akan diarsipkan beserta subkategorinya. Riwayat tetap tersimpan."
            : "Pos yang sudah dipakai akan diarsipkan. Perubahan kelompok tidak mengubah klasifikasi transaksi lama."}
        </p>
      </div>
      <section className="panel master-panel">
        <div className="master-toolbar">
          <div className="search-input">
            <Search size={18} />
            <input
              aria-label="Cari nama"
              placeholder={
                category
                  ? "Cari kategori atau subkategori…"
                  : "Cari pos pengeluaran…"
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <label className="filter-label">
            Status
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="active">Aktif</option>
              <option value="archived">Diarsipkan</option>
              <option value="all">Semua status</option>
            </select>
          </label>
        </div>
        <div className="list-heading">
          <span>{category ? "NAMA KATEGORI" : "NAMA POS & KELOMPOK"}</span>
          <span>{count} hasil</span>
        </div>
        {filtered.length ? (
          filtered.map(renderRow)
        ) : (
          <div className="empty-state">
            <span className="icon-tile">
              {category ? <Tags size={25} /> : <Shapes size={25} />}
            </span>
            <h2>
              {query || filter !== "active"
                ? "Tidak ada data yang cocok"
                : `Belum ada ${category ? "kategori produk" : "pos pengeluaran"}`}
            </h2>
            <p>
              {query || filter !== "active"
                ? "Coba ubah kata pencarian atau pilihan status."
                : `Tambahkan ${category ? "kategori utama, lalu subkategori layanan Anda" : "pos untuk biaya produksi, operasional, atau marketing"}.`}
            </p>
            {!query && filter === "active" && (
              <button className="button secondary" onClick={() => open()}>
                <Plus size={17} />
                Tambah {category ? "kategori pertama" : "pos pertama"}
              </button>
            )}
          </div>
        )}
        <div className="list-footer">
          {category
            ? "Dua level kategori · Tidak ada batas jumlah kategori"
            : "Tiga kelompok biaya · Nama pos dapat disesuaikan"}
        </div>
      </section>
      {category && <CategorySelect rows={categories} />}
      {editor && (
        <Modal
          title={`${editor.id ? "Ubah" : "Tambah"} ${category ? (editor.parentId ? "subkategori" : "kategori") : "pos pengeluaran"}`}
          pending={pending}
          onClose={() => setEditor(null)}
        >
          <form className="form-stack" onSubmit={submit} aria-busy={pending}>
            <label>
              Nama {category ? "kategori" : "pos"}
              <input
                autoFocus
                required
                maxLength={100}
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                aria-invalid={!!fields.name}
                aria-describedby={fields.name ? "name-error" : undefined}
              />
            </label>
            {fields.name && (
              <small id="name-error" className="field-error">
                {fields.name[0]}
              </small>
            )}
            {category ? (
              <label>
                Kategori induk
                <select
                  value={editor.parentId ?? ""}
                  onChange={(e) =>
                    setEditor({ ...editor, parentId: e.target.value || null })
                  }
                  aria-invalid={!!fields.parentId}
                >
                  <option value="">Tanpa induk (kategori utama)</option>
                  {categories
                    .filter(
                      (r) =>
                        !r.parentId &&
                        (r.isActive || r.id === editor.parentId) &&
                        r.id !== editor.id,
                    )
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.isActive ? "" : " (diarsipkan)"}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <label>
                Kelompok biaya
                <select
                  value={editor.group}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      group: e.target.value as Editor["group"],
                    })
                  }
                >
                  {Object.entries(expenseGroups).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {fields.parentId && (
              <small className="field-error">{fields.parentId[0]}</small>
            )}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={editor.isActive}
                onChange={(e) =>
                  setEditor({ ...editor, isActive: e.target.checked })
                }
              />
              Aktif untuk pilihan data baru
            </label>
            {category && (
              <small className="muted">
                Mengarsipkan kategori utama juga mengarsipkan subkategorinya.
                Mengaktifkan induk kembali tidak otomatis mengaktifkan
                subkategori.
              </small>
            )}
            {!category && editor.id && (
              <div className="alert">
                Transaksi lama tetap memakai kelompok saat dicatat.
              </div>
            )}
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                disabled={pending}
                onClick={() => setEditor(null)}
              >
                Batal
              </button>
              <button type="submit" disabled={pending}>
                {pending ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title={`Hapus ${label.toLowerCase()}?`}
          pending={pending}
          onClose={() => setDeleting(null)}
        >
          <p>
            <strong>{deleting.name}</strong> akan dihapus jika belum dipakai.
            Data yang sudah dipakai akan diarsipkan.
          </p>
          {category && !(deleting as CategoryRow).parentId && (
            <p className="muted">
              Tindakan ini juga berlaku pada seluruh subkategori di bawahnya.
            </p>
          )}
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={pending}
              onClick={() => setDeleting(null)}
            >
              Batal
            </button>
            <button
              className="danger"
              disabled={pending}
              onClick={() => void mutate("DELETE", deleting.id)}
            >
              {pending ? "Memproses…" : "Ya, lanjutkan"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
