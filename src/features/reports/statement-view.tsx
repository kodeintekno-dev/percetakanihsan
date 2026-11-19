"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Printer, RefreshCw } from "lucide-react";
import { ZodError } from "zod";
import { PageHeading } from "@/components/page-heading";
import { parseReportFilters, reportQuery, type ReportData } from "./schema";
import { automaticReportLabel, buildStatement, statementKinds, type StatementKind } from "./statements";

const months = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat("id-ID", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, i, 1))));
const reportAmount = new Intl.NumberFormat("id-ID");

export function ReportView({ data, initialKind = "laba-rugi" }: { data: ReportData; initialKind?: StatementKind }) {
  const router = useRouter();
  const [transition, startTransition] = useTransition();
  const [kind, setKind] = useState<StatementKind>(initialKind);
  const [mode, setMode] = useState(data.period.filters.mode);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pending = !!busy || transition;
  const report = buildStatement(data, kind);

  function fail(error: unknown) {
    setError(error instanceof ZodError ? error.issues.map(issue => issue.message).join(" ")
      : error instanceof Error ? error.message : "Permintaan gagal. Coba kembali.");
  }
  function applyPeriod(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    try {
      const filters = parseReportFilters(Object.fromEntries(new FormData(event.currentTarget)));
      startTransition(() => router.push(`/laporan?${reportQuery(filters)}&statement=${kind}`));
    } catch (error) { fail(error); }
  }
  async function download(format: "csv" | "xlsx") {
    setBusy(format); setError("");
    try {
      const response = await fetch("/api/exports/reports", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: data.period.filters, statement: kind, format, revision: data.revision }),
      });
      if (response.status === 401) { router.replace("/login"); return; }
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob()), anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `${kind}.${format}`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`${report.title} ${report.status === "draft" ? "(draf) " : ""}berhasil diunduh.`);
    } catch (error) { fail(error); } finally { setBusy(""); }
  }

  return <div className="financial-reports">
    <PageHeading eyebrow="LAPORAN USAHA" title="Laporan Keuangan"
      description="Pilih jenis dan periode. Angka dihitung otomatis dari data yang sudah tercatat, tanpa isian pelengkap."
      action={<div className="report-export-buttons">
        <button disabled={pending} onClick={() => void download("xlsx")}><Download size={16} />{busy === "xlsx" ? "Mengunduh…" : "Excel siap cetak"}</button>
        <button className="button secondary" disabled={pending} onClick={() => void download("csv")}><Download size={16} />CSV</button>
        <button className="button secondary" disabled={pending} onClick={() => window.print()}><Printer size={16} />Cetak</button>
      </div>} />
    {message && <div className="toast" role="status"><span>{message}</span><button className="text-button" onClick={() => setMessage("")}>Tutup</button></div>}
    {error && <div className="alert error" role="alert">{error}</div>}
    <nav className="statement-tabs" aria-label="Jenis laporan">
      {(Object.entries(statementKinds) as [StatementKind, string][]).map(([key, title]) =>
        <button key={key} type="button" aria-pressed={kind === key} className={kind === key ? "" : "button secondary"} disabled={pending} onClick={() => {
          setKind(key); setMessage("");
          window.history.replaceState(null, "", `/laporan?${reportQuery(data.period.filters)}&statement=${key}`);
        }}>{title}</button>)}
    </nav>
    <section className="panel report-filter"><form onSubmit={applyPeriod}>
      <div className="report-filter-grid">
        <label>Periode<select name="mode" value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="month">Bulan dan tahun</option><option value="range">Rentang tanggal</option></select></label>
        <fieldset className="report-period-fields" hidden={mode !== "month"} disabled={mode !== "month"}>
          <legend className="sr-only">Bulan dan tahun</legend>
          <label>Bulan<select name="month" defaultValue={Number(data.period.end.slice(5, 7))}>{months.map((month, i) => <option key={month} value={i + 1}>{month}</option>)}</select></label>
          <label>Tahun<input name="year" type="number" min={1} max={9999} required defaultValue={Number(data.period.end.slice(0, 4))} /></label>
        </fieldset>
        <fieldset className="report-period-fields" hidden={mode !== "range"} disabled={mode !== "range"}>
          <legend className="sr-only">Rentang tanggal</legend>
          <label>Tanggal mulai<input name="start" type="date" required defaultValue={data.period.start} /></label>
          <label>Tanggal akhir<input name="end" type="date" required defaultValue={data.period.end} /></label>
        </fieldset>
      </div>
      <div className="order-filter-actions"><span className="report-hint">{kind === "neraca"
        ? "Neraca memakai posisi pada tanggal akhir. Ekuitas = total aset dikurangi total hutang tercatat."
        : "Laporan memakai transaksi dalam periode yang dipilih."}</span><button disabled={pending}>Tampilkan</button></div>
    </form></section>
    <div className="report-updated"><span>Satu jenis laporan per file. Target cetak 1–2 halaman per laporan.</span><button className="button secondary" disabled={pending} onClick={() => startTransition(() => router.refresh())}><RefreshCw size={14} />Muat ulang</button></div>
    <article className="statement-paper" aria-label={`Pratinjau ${report.title}`}>
      <header className="statement-heading"><p>CV Ihsan Mandiri</p><h2>{report.title}</h2><p>{report.period}</p><p className={`statement-status ${report.status}`}>{report.status === "draft" ? "DRAF — perlu pemeriksaan" : automaticReportLabel}</p></header>
      <table className="statement-table"><thead><tr><th scope="col">Uraian</th><th scope="col">Jumlah (Rp)</th></tr></thead><tbody>
        {report.rows.map((row, index) => <tr key={`${row.label}-${index}`} className={`statement-${row.style}`}><th scope="row">{row.label}</th><td>{row.style === "section" ? "" : row.amount === null ? <span className="statement-unavailable">Belum tersedia</span> : reportAmount.format(BigInt(row.amount))}</td></tr>)}
      </tbody></table>
      {report.issues.length > 0 && <div className="statement-issues"><strong>Perlu diperiksa</strong><ul>{report.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
      <div className="statement-notes">{report.notes.map(note => <p key={note}>{note}</p>)}</div>
    </article>
  </div>;
}
