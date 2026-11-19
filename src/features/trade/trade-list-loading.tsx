import type { TradeKind } from "./schema";

export function TradeListLoading({ kind }: { kind: TradeKind }) {
  const label = kind === "RECEIVABLE" ? "piutang" : "hutang";
  return (
    <div className="trade-loading panel empty-state" role="status">
      <div className="spinner" aria-hidden="true" />
      <h2>Memuat {label}…</h2>
      <p>Menyiapkan ringkasan dan daftar tagihan.</p>
    </div>
  );
}
