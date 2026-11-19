# Verifikasi laporan otomatis — 19 November 2026

## Perilaku akhir

- Neraca, Laba Rugi dan Arus Kas terpisah, masing-masing diekspor sebagai satu worksheet Excel atau CSV dua kolom. Form dan tombol simpan pelengkap dihapus.
- Kas neraca mencakup saldo pembukaan dan seluruh pergerakan sampai tanggal akhir. Kas per tanggal neraca tetap tersedia ketika awal rentang mendahului pembukaan, asalkan tanggal akhir sudah pada/setelah pembukaan.
- Aset = kas akhir + sisa piutang tercatat + nilai buku aset. Hutang = sisa hutang pemasok tercatat. Ekuitas = aset - hutang. Modal pemilik dan saldo laba disajikan sebagai ekuitas gabungan karena transaksi lama belum memisahkan sumber tersebut.
- Contoh teruji tanpa transaksi/pos lain: saldo pembukaan Rp5.000.000 menghasilkan kas, aset dan ekuitas masing-masing Rp5.000.000. Saldo pembukaan tidak dihitung dua kali atau dimasukkan ke pendapatan.
- Perubahan transaksi langsung memengaruhi laporan saat dimuat ulang, tanpa isian atau konfirmasi pelengkap.
- Aset dengan pembayaran tertaut sebelum tanggal neraca sudah termasuk meskipun baru digunakan bulan berikutnya; penyusutan tetap mengikuti bulan mulai digunakan. Aset masa depan tanpa bukti pembayaran sebelum tanggal neraca dikecualikan.
- Laba rugi mengikuti Buku Kas dengan penyesuaian pembelian aset tertaut dan penyusutan. Arus kas memisahkan investasi aset tertaut dari kas lainnya. Excel tetap A4 portrait, area cetak A:B, lebar satu halaman, isi 11 pt; tinggi tidak dipaksa menjadi satu halaman.

## Keutuhan database

Tidak ada koneksi, migrasi, seed, bootstrap, update atau penghapusan terhadap database aplikasi dalam pekerjaan ini. Seluruh pengujian memakai dua database baru di cluster QA lokal port 54987: `qa_automatic_reports_tests` dan `qa_automatic_reports_legacy`. Build/typecheck menggunakan URL sentinel localhost port 1.

Database QA legacy dibuat hanya dengan skema bisnis lama, **tanpa `FinancialReportPreparation`**. Laporan, halaman HTML dan enam unduhan HTTP final berhasil di sana. Fingerprint seluruh baris pada 15 tabel lama identik sebelum/sesudah pembacaan dan ekspor. Tes integrasi juga memasukkan arsip pelengkap manual ke database QA biasa: arsip tidak memengaruhi angka/fingerprint laporan dan tetap identik setelah laporan dibaca. Fingerprint keutuhan mencakup seluruh 16 tabel ketika arsip tersebut tersedia.

Laporan otomatis tidak lagi membaca/menulis tabel pelengkap. Model dan migrasi historis tetap dipertahankan, tanpa perubahan/drop/backfill. Endpoint simpan lama memeriksa admin/origin lalu mengembalikan **410**; endpoint tidak menjalankan query laporan atau menyimpan data. Ekspor menolak nominal `values` dari klien dengan **422** dan revisi usang dengan **409**. Tidak diperlukan migrasi baru untuk perubahan otomatis ini.

## Hasil pengujian final

- **146 tes unit lulus**, termasuk saldo Rp5 juta, saldo nol, ekuitas negatif, piutang/hutang/aset, pembelian aset dan penyusutan, tanggal pembukaan, presisi 18 digit, formula injection, kontrak HTTP dan render komponen tanpa form pelengkap.
- **88 tes integrasi/HTTP lulus** pada build final dengan database QA bersih. Enam tes integrasi khusus laporan otomatis mencakup keutuhan data, arsip manual yang diabaikan, tanggal akhir yang sama pada rentang berbeda, pembaruan otomatis setelah transaksi, aset dibayar sebelum digunakan, dan awal rentang sebelum pembukaan kas.
- **Enam unduhan HTTP final lulus** pada database legacy: tiga jenis × CSV/XLSX, semua HTTP 200 tanpa isian pelengkap. Angka CSV cocok dengan pratinjau; worksheet tunggal, dua kolom dan portrait diverifikasi. Halaman HTML menampilkan Rp5 juta dan tidak memuat form/tombol pelengkap.
- **ESLint, TypeScript, `git diff --check`, dan build produksi Webpack pada salinan QA lulus.**
- Ketiga workbook contoh dirender dan diperiksa: judul, angka, subtotal/total, keterangan pembukaan dan ekuitas terbaca; tidak ada kolom modal/saldo laba yang menampilkan “Belum tersedia”.

## Batas dan tindak lanjut

- Keseimbangan neraca berasal dari aset dan hutang yang tersedia, bukan bukti seluruh posisi keuangan sudah tercatat. Persediaan, pinjaman, uang muka, setoran/pengambilan pemilik dan pelepasan aset yang belum memiliki pencatatan khusus tidak ditebak atau disajikan nol seolah sudah diverifikasi. Modal dan saldo laba tidak dipisah secara buatan.
- Laba rugi masih basis kas dengan penyusutan, belum akrual penuh. Pemasukan lain-lain tetap mengikuti Buku Kas; modal, pinjaman dan hasil penjualan aset belum bisa diklasifikasikan terpisah secara andal dari data tersebut. Arus pendanaan lengkap belum dapat dihasilkan otomatis tanpa sumber klasifikasi yang memadai.
- Kas yang memang belum tersedia karena pembukaan belum diatur atau tanggal neraca mendahului pembukaan tetap ditandai draf, bukan nol.
- Cetak langsung di Microsoft Excel/printer fisik belum diverifikasi. Pengaturan XLSX dan render workbook diuji; target 1–2 halaman per jenis tetap bergantung aplikasi/printer. Pemeriksaan UI kali ini memakai render komponen dan respons HTML, bukan sesi browser interaktif.
- Build masih mengeluarkan peringatan keamanan versi Next.js terpasang. Pengulangan perintah build berhasil dengan peringatan tersebut; dependensi tidak diubah. Driver PostgreSQL juga mengeluarkan peringatan deprecation query bersamaan yang sudah ada sebelumnya.
- Tidak ada commit, push atau deployment. Proses aplikasi dan PostgreSQL QA dihentikan setelah pemeriksaan final.
