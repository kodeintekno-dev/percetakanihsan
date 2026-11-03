"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { formatRupiah } from "@/lib/money";
import type { BudgetSummary } from "./schema";
export function BudgetDeleteButton({
  budget,
  iconOnly = false,
}: {
  budget: BudgetSummary;
  iconOnly?: boolean;
}) {
  const router = useRouter(),
    [open, setOpen] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function remove() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/budgets/${budget.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updatedAt: budget.updatedAt }),
      });
      const data = await response.json();
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        setError(data.error);
        return;
      }
      setOpen(false);
      router.push("/budgeting?notice=deleted");
      router.refresh();
    } catch {
      setError("Koneksi terputus. Muat ulang riwayat sebelum mencoba kembali.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className={
          iconOnly ? "icon-button danger-text" : "button secondary danger-text"
        }
        aria-label={`Hapus estimasi ${budget.title}`}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <Trash2 size={17} />
        {!iconOnly && "Hapus estimasi"}
      </button>
      {open && (
        <Modal
          title="Hapus estimasi?"
          pending={pending}
          onClose={() => setOpen(false)}
        >
          <p>
            <strong>{budget.title}</strong>
          </p>
          <p>
            {budget.budgetNumber} · HPP {formatRupiah(budget.totalHpp)}
          </p>
          <div className="alert">
            Estimasi dihapus dari riwayat aktif. Komponen dan hasil simulasi
            tetap tersimpan. Pesanan dan kas tidak berubah.
          </div>
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Batal
            </button>
            <button
              type="button"
              className="button danger"
              disabled={pending}
              onClick={() => void remove()}
            >
              {pending ? "Menghapus…" : "Ya, hapus estimasi"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
