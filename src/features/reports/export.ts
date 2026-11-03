import "server-only";
import ExcelJS from "exceljs";
import {
  tabularCsv,
  spreadsheetNumber,
  type ExportCell,
} from "@/lib/spreadsheet-export";
import { expenseGroupNames, type ReportData } from "./schema";
import { incomeName, reportBalanceNote } from "./format";
export const reportCsvHeaders = [
  "bagian",
  "subbagian",
  "nama",
  "jumlah_transaksi",
  "jumlah_pesanan",
  "kuantitas",
  "satuan",
  "nominal",
  "persentase",
  "saldo_awal",
  "saldo_akhir",
  "periode_mulai",
  "periode_selesai",
];
const n = (value: string | number | null): ExportCell =>
  value === null ? null : { number: String(value) };
type FlatRow = {
  section: string;
  sub: string;
  name: string;
  transactions?: number;
  orders?: number;
  quantity?: string;
  unit?: string;
  amount?: string | null;
  percent?: string;
  opening?: string | null;
  closing?: string | null;
};
export function reportFlatRows(data: ReportData): ExportCell[][] {
  const rows: FlatRow[] = [],
    f = data.finance;
  rows.push(
    { section: "metadata", sub: "perusahaan", name: "CV Ihsan Mandiri" },
    {
      section: "metadata",
      sub: "basis",
      name: "Laporan Keuangan Sederhana (Berbasis Kas)",
    },
    {
      section: "metadata",
      sub: "dibuat_wib",
      name: new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "long",
        timeZone: "Asia/Jakarta",
      }).format(new Date(data.generatedAt)),
    },
    {
      section: "metadata",
      sub: "status_saldo",
      name: reportBalanceNote(f) || "Saldo terkonfigurasi",
    },
  );
  for (const [sub, name, amount] of [
    ["kas_masuk", "Kas masuk", f.income],
    ["kas_keluar", "Kas keluar", f.expense],
    ["selisih", "Selisih", f.net],
  ])
    rows.push({ section: "ringkasan", sub, name, amount });
  rows.push({
    section: "ringkasan",
    sub: "pesanan_periode",
    name: "Pesanan masuk berdasarkan tanggal pesanan",
    orders: data.orderCount,
  });
  for (const row of data.income.sales) {
    rows.push({
      section: "pendapatan",
      sub: "penjualan",
      name: incomeName(row),
      transactions: row.transactionCount,
      orders: row.linkedOrderCount,
      amount: row.amount,
    });
    for (const q of row.quantities)
      rows.push({
        section: "pendapatan",
        sub: "kuantitas_tercatat",
        name: incomeName(row),
        quantity: q.quantity,
        unit: q.unit,
      });
    if (row.unknownQuantityCount)
      rows.push({
        section: "pendapatan",
        sub: "kuantitas_belum_dicatat",
        name: incomeName(row),
        transactions: row.unknownQuantityCount,
      });
  }
  rows.push(
    {
      section: "pendapatan",
      sub: "lain_lain",
      name: "Pemasukan lain-lain",
      transactions: data.income.otherTransactionCount,
      amount: data.income.otherAmount,
    },
    {
      section: "pendapatan",
      sub: "total",
      name: "Total pendapatan kas",
      transactions:
        data.income.saleTransactionCount + data.income.otherTransactionCount,
      orders: data.income.linkedOrderCount,
      amount: f.income,
    },
  );
  for (const [group, label] of Object.entries(expenseGroupNames)) {
    const details = data.expenses.filter((e) => e.group === group);
    for (const row of details)
      rows.push({
        section: "pengeluaran",
        sub: group.toLowerCase(),
        name: row.postName,
        transactions: row.transactionCount,
        amount: row.amount,
      });
    rows.push({
      section: "pengeluaran",
      sub: `total_${group.toLowerCase()}`,
      name: `Total beban ${label}`,
      transactions: details.reduce((sum, r) => sum + r.transactionCount, 0),
      amount: f.groups[group as keyof typeof expenseGroupNames],
    });
  }
  rows.push({
    section: "laba_rugi",
    sub: "pendapatan",
    name: "Pendapatan kas",
    amount: f.income,
  });
  for (const [group, label] of Object.entries(expenseGroupNames))
    rows.push({
      section: "laba_rugi",
      sub: group.toLowerCase(),
      name: `Beban ${label}`,
      amount: f.groups[group as keyof typeof expenseGroupNames],
    });
  rows.push({
    section: "laba_rugi",
    sub: "selisih_bersih",
    name: "Laba/rugi sederhana berbasis kas",
    amount: f.net,
  });
  rows.push(
    {
      section: "arus_kas",
      sub: "saldo_pembukaan",
      name: data.opening
        ? `Efektif ${data.opening.date}; bukan pemasukan`
        : "Belum dikonfigurasi",
      amount: data.opening?.amount ?? null,
    },
    {
      section: "arus_kas",
      sub: "periode",
      name: "Saldo awal/akhir periode",
      amount: f.net,
      opening: f.openingBalance,
      closing: f.closingBalance,
    },
    {
      section: "arus_kas",
      sub: "kas_masuk",
      name: "Kas masuk periode",
      amount: f.income,
    },
    {
      section: "arus_kas",
      sub: "kas_keluar",
      name: "Kas keluar periode",
      amount: f.expense,
    },
  );
  for (const day of data.daily) {
    rows.push(
      {
        section: "arus_kas",
        sub: "harian_masuk",
        name: day.date,
        amount: day.income,
      },
      {
        section: "arus_kas",
        sub: "harian_keluar",
        name: day.date,
        amount: day.expense,
      },
      {
        section: "arus_kas",
        sub: "harian_selisih",
        name: day.date,
        amount: day.net,
        opening: day.openingBalance,
        closing: day.closingBalance,
      },
    );
  }
  if (!data.posts.length)
    rows.push({
      section: "analitik_pos",
      sub: "kosong",
      name: "Belum ada pengeluaran",
      amount: "0",
      percent: "0.00",
    });
  for (const post of data.posts)
    rows.push({
      section: "analitik_pos",
      sub: post.groups.map((g) => expenseGroupNames[g]).join(" / "),
      name: post.postName,
      transactions: post.transactionCount,
      amount: post.amount,
      percent: post.percent,
    });
  return rows.map((r) => [
    r.section,
    r.sub,
    r.name,
    n(r.transactions ?? null),
    n(r.orders ?? null),
    n(r.quantity ?? null),
    r.unit ?? null,
    n(r.amount ?? null),
    n(r.percent ?? null),
    n(r.opening ?? null),
    n(r.closing ?? null),
    data.period.start,
    data.period.end,
  ]);
}
export const reportsCsv = (data: ReportData) =>
  tabularCsv(reportCsvHeaders, reportFlatRows(data));
type SheetSpec = {
  name: string;
  headers: string[];
  widths: number[];
  rows: ExportCell[][];
  money?: number[];
  percent?: number[];
  notes?: string[];
};
export async function reportsXlsx(data: ReportData) {
  const f = data.finance,
    book = new ExcelJS.Workbook();
  book.creator = "CV Ihsan Mandiri";
  book.created = new Date(data.generatedAt);
  book.subject = "Laporan Keuangan Sederhana Berbasis Kas";
  const revenue: ExportCell[][] = [];
  for (const row of data.income.sales) {
    revenue.push([
      row.categoryName,
      row.productName,
      n(row.transactionCount),
      n(row.linkedOrderCount),
      "Penjualan",
      null,
      null,
      n(row.amount),
    ]);
    for (const q of row.quantities)
      revenue.push([
        row.categoryName,
        row.productName,
        null,
        null,
        "Kuantitas tercatat",
        n(q.quantity),
        q.unit,
        null,
      ]);
    if (row.unknownQuantityCount)
      revenue.push([
        row.categoryName,
        row.productName,
        n(row.unknownQuantityCount),
        null,
        "Kuantitas belum dicatat",
        null,
        null,
        null,
      ]);
  }
  revenue.push(
    [
      "Lain-lain",
      "Non-penjualan",
      n(data.income.otherTransactionCount),
      null,
      "Pemasukan lain-lain",
      null,
      null,
      n(data.income.otherAmount),
    ],
    [
      "TOTAL",
      "Semua pendapatan",
      n(data.income.saleTransactionCount + data.income.otherTransactionCount),
      n(data.income.linkedOrderCount),
      "Total kas masuk",
      null,
      null,
      n(f.income),
    ],
  );
  const costs: ExportCell[][] = [];
  for (const [group, label] of Object.entries(expenseGroupNames)) {
    const details = data.expenses.filter((e) => e.group === group);
    for (const row of details)
      costs.push([
        label,
        row.postName,
        n(row.transactionCount),
        n(row.amount),
        "Rincian pos",
      ]);
    costs.push([
      label,
      `Total beban ${label}`,
      n(details.reduce((s, r) => s + r.transactionCount, 0)),
      n(f.groups[group as keyof typeof expenseGroupNames]),
      "Subtotal kelompok",
    ]);
  }
  const specs: SheetSpec[] = [
    {
      name: "Ringkasan",
      headers: ["Bagian", "Keterangan", "Nilai", "Basis"],
      widths: [24, 45, 27, 62],
      money: [2],
      rows: [
        [
          "Ringkasan",
          "Kas masuk (Rp)",
          n(f.income),
          "Transaksi pemasukan aktif",
        ],
        [
          "Ringkasan",
          "Kas keluar (Rp)",
          n(f.expense),
          "Transaksi pengeluaran aktif",
        ],
        [
          "Ringkasan",
          "Selisih (Rp)",
          n(f.net),
          "Kas masuk dikurangi kas keluar",
        ],
        [
          "Ringkasan",
          "Jumlah pesanan",
          n(data.orderCount),
          "Pesanan aktif bertanggal dalam periode",
        ],
        [
          "Laba rugi",
          "Pendapatan kas (Rp)",
          n(f.income),
          "Penjualan + pemasukan lain-lain",
        ],
        ...Object.entries(expenseGroupNames).map(
          ([g, label]) =>
            [
              "Laba rugi",
              `Beban ${label} (Rp)`,
              n(f.groups[g as keyof typeof expenseGroupNames]),
              "Kelompok historis saat transaksi dicatat",
            ] as ExportCell[],
        ),
        [
          "Laba rugi",
          "Laba/rugi sederhana (Rp)",
          n(f.net),
          "Pendapatan kas dikurangi seluruh beban",
        ],
        [
          "Pembukaan",
          "Saldo pembukaan (Rp)",
          n(data.opening?.amount ?? null),
          data.opening
            ? `Efektif ${data.opening.date}; bukan pendapatan`
            : "Belum dikonfigurasi",
        ],
        [
          "Arus kas",
          "Saldo awal periode (Rp)",
          n(f.openingBalance),
          reportBalanceNote(f) || "Pembukaan + kas bersih sebelum periode",
        ],
        [
          "Arus kas",
          "Saldo akhir periode (Rp)",
          n(f.closingBalance),
          reportBalanceNote(f) || "Saldo awal + kas masuk - kas keluar",
        ],
      ],
      notes: [
        "Laba/rugi ini adalah ringkasan operasional kas tercatat. Harga pesanan dan estimasi HPP tidak menjadi pendapatan/beban otomatis.",
      ],
    },
    {
      name: "Pendapatan",
      headers: [
        "Kategori",
        "Produk / subkategori",
        "Transaksi",
        "Pesanan tertaut unik",
        "Jenis rincian",
        "Kuantitas",
        "Satuan",
        "Nominal (Rp)",
      ],
      widths: [28, 30, 15, 24, 29, 23, 18, 27],
      rows: revenue,
      money: [7],
      notes: [
        "Kuantitas berasal dari soldQuantity pada setiap penerimaan; DP tidak menyalin ulang kuantitas pesanan.",
        "Baris kuantitas dan belum dicatat tidak mengulang nominal. Satuan berbeda tidak dijumlahkan. Kosong berarti belum diketahui; nol berarti dicatat eksplisit.",
        "Jumlah pesanan pada TOTAL dihitung unik di seluruh penerimaan penjualan, bukan penjumlahan ulang setiap baris.",
      ],
    },
    {
      name: "Pengeluaran",
      headers: [
        "Kelompok historis",
        "Pos pengeluaran",
        "Transaksi",
        "Nominal (Rp)",
        "Jenis rincian",
      ],
      widths: [25, 40, 18, 28, 28],
      rows: costs,
      money: [3],
      notes: [
        "Pengelompokan mengikuti snapshot transaksi. Perubahan kelompok master tidak mereklasifikasi transaksi lampau; nama pos mengikuti master saat ini.",
      ],
    },
    {
      name: "Arus Kas",
      headers: [
        "Bagian",
        "Tanggal / keterangan",
        "Kas masuk (Rp)",
        "Kas keluar (Rp)",
        "Selisih (Rp)",
        "Saldo awal (Rp)",
        "Saldo akhir (Rp)",
      ],
      widths: [22, 45, 27, 27, 27, 27, 27],
      money: [2, 3, 4, 5, 6],
      rows: [
        [
          "Pembukaan",
          data.opening
            ? `Efektif ${data.opening.date}; bukan pemasukan`
            : "Belum dikonfigurasi",
          null,
          null,
          null,
          n(data.opening?.amount ?? null),
          null,
        ],
        [
          "Periode",
          `${data.period.start} – ${data.period.end}`,
          n(f.income),
          n(f.expense),
          n(f.net),
          n(f.openingBalance),
          n(f.closingBalance),
        ],
        ...data.daily.map(
          (day) =>
            [
              "Harian",
              day.date,
              n(day.income),
              n(day.expense),
              n(day.net),
              n(day.openingBalance),
              n(day.closingBalance),
            ] as ExportCell[],
        ),
        ...(!data.daily.length
          ? [
              [
                "Harian",
                "Tidak ada transaksi pada periode ini",
                null,
                null,
                null,
                null,
                null,
              ] as ExportCell[],
            ]
          : []),
      ],
      notes: [
        reportBalanceNote(f) ||
          "Saldo berantai dihitung dari pembukaan dan transaksi aktif sebelumnya.",
        "Rincian harian hanya menampilkan tanggal dengan transaksi, tanpa menambah transaksi palsu pada hari kosong.",
      ],
    },
    {
      name: "Analitik Pos",
      headers: [
        "Pos pengeluaran",
        "Kelompok historis",
        "Transaksi",
        "Nominal (Rp)",
        "Persentase (%)",
      ],
      widths: [40, 40, 18, 28, 23],
      money: [3],
      percent: [4],
      rows: data.posts.length
        ? data.posts.map((post) => [
            post.postName,
            post.groups.map((g) => expenseGroupNames[g]).join(" / "),
            n(post.transactionCount),
            n(post.amount),
            n(post.percent),
          ])
        : [["Belum ada pengeluaran", null, n(0), n("0"), n("0.00")]],
      notes: [
        "Pos diurutkan menurut nominal terbesar. Persentase = nominal pos / seluruh pengeluaran × 100; pembagi nol menghasilkan 0%.",
        "Persentase dibulatkan dua desimal; jumlah persentase yang telah dibulatkan dapat sedikit berbeda dari 100%.",
      ],
    },
  ];
  const chunk = 1_048_560;
  for (const spec of specs)
    for (
      let part = 0;
      part < Math.max(1, Math.ceil(spec.rows.length / chunk));
      part++
    ) {
      const sheet = book.addWorksheet(
        part ? `${spec.name} ${part + 1}` : spec.name,
        {
          views: [{ state: "frozen", ySplit: 6 }],
          pageSetup: {
            paperSize: 9,
            orientation: "landscape",
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            printTitlesRow: "1:6",
          },
        },
      );
      sheet.columns = spec.widths.map((width) => ({ width }));
      for (const [index, text] of [
        "CV Ihsan Mandiri",
        `${spec.name} · Laporan Keuangan Sederhana (Berbasis Kas)`,
        `Periode: ${data.period.label} | ${data.period.start} – ${data.period.end} (WIB)`,
        `Dibuat: ${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "long", timeZone: "Asia/Jakarta" }).format(book.created)}`,
      ].entries()) {
        sheet.mergeCells(index + 1, 1, index + 1, spec.headers.length);
        const cell = sheet.getCell(index + 1, 1);
        cell.value = text;
        cell.font = {
          name: "Calibri",
          size: index ? 11 : 16,
          bold: index < 2,
          color: { argb: index ? "FF355442" : "FFFFFFFF" },
        };
        cell.alignment = { vertical: "middle", wrapText: true };
        sheet.getRow(index + 1).height = index ? 23 : 31;
        if (index === 0)
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF145D4B" },
          };
      }
      sheet.getRow(6).values = spec.headers;
      sheet.getRow(6).height = 32;
      sheet.getRow(6).font = {
        name: "Calibri",
        size: 11,
        bold: true,
        color: { argb: "FFFFFFFF" },
      };
      sheet.getRow(6).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF386C57" },
      };
      sheet.getRow(6).alignment = { vertical: "middle", wrapText: true };
      for (const [index, values] of spec.rows
        .slice(part * chunk, (part + 1) * chunk)
        .entries()) {
        const row = sheet.addRow(
          values.map((cell) =>
            cell && typeof cell === "object"
              ? spreadsheetNumber(cell.number)
              : cell,
          ),
        );
        row.font = { name: "Calibri", size: 11 };
        row.alignment = { vertical: "top", wrapText: true };
        row.height = Math.max(
          24,
          ...values.map(
            (cell, col) =>
              Math.min(
                6,
                Math.ceil(
                  (typeof cell === "string" ? cell.length : 10) /
                    (spec.widths[col] - 2),
                ),
              ) *
                14 +
              8,
          ),
        );
        if (index % 2 === 1)
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF2F6EF" },
          };
        values.forEach((cell, col) => {
          if (cell && typeof cell === "object")
            row.getCell(col + 1).numFmt =
              typeof row.getCell(col + 1).value !== "number"
                ? "@"
                : spec.percent?.includes(col)
                  ? '0.00"%"'
                  : spec.money?.includes(col)
                    ? "#,##0;[Red]-#,##0"
                    : "#,##0.###";
        });
      }
      sheet.autoFilter = {
        from: { row: 6, column: 1 },
        to: { row: sheet.rowCount, column: spec.headers.length },
      };
      sheet.addRow([]);
      for (const note of [
        ...(spec.notes ?? []),
        "Presisi: angka di atas 15 digit signifikan atau integer di luar rentang aman JS ditulis teks agar tidak berubah.",
      ]) {
        const row = sheet.addRow([note]);
        sheet.mergeCells(row.number, 1, row.number, spec.headers.length);
        row.font = { name: "Calibri", size: 10, color: { argb: "FF61745E" } };
        row.alignment = { wrapText: true };
        row.height = 31;
      }
    }
  return new Uint8Array(await book.xlsx.writeBuffer());
}
