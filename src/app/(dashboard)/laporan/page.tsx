import Link from "next/link";
import { ZodError } from "zod";
import { requirePageAdmin } from "@/lib/auth/session";
import { PageHeading } from "@/components/page-heading";
import { parseReportFilters, reportQuery } from "@/features/reports/schema";
import { getReport } from "@/features/reports/service";
import { ReportView } from "@/features/reports/report-view";
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageAdmin();
  const result = await load(await searchParams);
  if ("error" in result)
    return (
      <>
        <PageHeading
          title="Laporan Keuangan Sederhana (Berbasis Kas)"
          description="Periksa kembali periode laporan."
        />
        <div className="alert error" role="alert">
          {result.error}
        </div>
        <Link className="button secondary" href="/laporan">
          Reset ke bulan berjalan
        </Link>
      </>
    );
  return (
    <ReportView
      key={`${reportQuery(result.data.period.filters)}:${result.data.revision}`}
      data={result.data}
    />
  );
}
async function load(input: Record<string, string | string[] | undefined>) {
  try {
    return { data: await getReport(parseReportFilters(input)) };
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    return { error: error.issues.map((i) => i.message).join(" ") };
  }
}
