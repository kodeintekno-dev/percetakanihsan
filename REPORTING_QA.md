# Verifikasi laporan keuangan terpisah — 19 November 2026

## Hasil implementasi

- Halaman Laporan menyediakan Neraca, Laba Rugi dan Arus Kas; setiap unduhan hanya memuat satu jenis dengan dua kolom dan tanpa ID internal.
- XLSX: A4 portrait, lebar satu halaman, area cetak A:B, font isi 11 pt, judul berulang. Tinggi tidak dipaksa menjadi satu halaman. CSS cetak menyembunyikan navigasi dan formulir, serta memakai halaman A4 khusus laporan.
- CSV: UTF-8 BOM, dua kolom, angka presisi dan perlindungan formula injection. CSV tidak menyimpan tata cetak.
- Neraca memakai saldo kas akhir, tagihan tercatat dan aset yang sudah mulai digunakan pada tanggal neraca, ditambah saldo pelengkap yang diisi dan diperiksa pengguna. Modal/saldo laba tidak dibuat otomatis sebagai angka penyeimbang. Data belum lengkap atau berselisih tetap draf.
- Laba rugi mempertahankan basis kas dengan penyusutan, disertai pengelompokan ulang modal/pinjaman/pembelian aset. Belum akrual penuh. Penjualan aset membuat laba rugi tetap draf karena laba/rugi pelepasan belum tersedia.
- Pelengkap tersimpan mengikuti periode, menambah versi baru tanpa menimpa riwayat. Revisi usang ditolak. Perubahan sumber membatalkan konfirmasi pada hasil baca tanpa mengubah baris versi lama.

## Perlindungan database aplikasi

Database aplikasi tidak dipakai dalam pengujian. Tidak ada migrasi, seed, bootstrap admin, pembaruan atau penghapusan yang dijalankan terhadap database aplikasi. Build/typecheck memakai URL sentinel localhost port 1. Pengujian database hanya memakai dua database simulasi pada cluster PostgreSQL baru di `.qa`, localhost port 54987.

Migrasi `20261119000000_financial_report_preparations` disiapkan dan hanya diuji pada database QA. Isinya membuat tabel baru `FinancialReportPreparation` beserta indeks dan constraint, tanpa mengubah tabel bisnis lama. Migrasi **belum diterapkan ke database aplikasi**. Sebelum tabel tersedia, halaman tetap dapat mempratinjau/mengekspor isian sementara dan tombol simpan dinonaktifkan.

Perbandingan fingerprint seluruh baris pada 15 tabel lama di database QA tetap identik sebelum/sesudah pembacaan, enam ekspor HTTP, dan penyimpanan pelengkap. Jalur baca/ekspor hanya menjalankan query baca. Jalur simpan pelengkap hanya menggunakan `create` pada tabel baru; tidak ada endpoint ubah/hapus versi.

## Pengujian yang lulus

- 147 tes unit, termasuk 26 tes baru untuk angka, kelengkapan, presisi, struktur ekspor, autentikasi, origin, batas body dan revisi.
- 86 tes integrasi/HTTP pada build final dengan database QA bersih, termasuk 4 tes baru untuk readiness tanpa tabel, pengecualian aset masa depan, keutuhan tabel lama, versi pelengkap dan pembatalan konfirmasi saat sumber berubah.
- Enam ekspor HTTP final (tiga jenis × CSV/XLSX): HTTP 200, nama file/worksheet benar, dua kolom, nominal cocok dengan pratinjau. Ekspor memakai revisi usang mengembalikan 409.
- ESLint, TypeScript, `git diff --check`, dan build produksi Webpack pada salinan QA lulus. Next.js mengubah `next-env.d.ts` secara otomatis ketika menghasilkan tipe/build.
- Browser: pergantian jenis, neraca simulasi seimbang, isian belum diterapkan memblokir ekspor, simpan versi dan muat ulang mempertahankan jenis laporan terpilih. Tampilan 390 px tidak meluber ke samping. Angka negatif ditampilkan tanpa pengulangan simbol Rupiah.
- Ketiga workbook contoh dibaca ulang dan dirender melalui runtime spreadsheet. Judul, angka, subtotal, total, catatan dan dua kolom terbaca.

## Batas verifikasi dan tindak lanjut

- Alat otomatisasi pembuka Excel serta penantian event unduhan browser macet. Cetak langsung di Microsoft Excel/printer fisik dan alur unduhan browser sampai selesai belum terverifikasi. Pengaturan cetak serta hasil berkas HTTP telah diperiksa; target 1–2 halaman per jenis belum menjadi jaminan jumlah halaman pada setiap printer/aplikasi spreadsheet.
- Build mengeluarkan peringatan keamanan pada versi Next.js yang terpasang. Perintah build berikutnya berhasil dengan peringatan tersebut. Dependensi tidak diperbarui dalam pekerjaan ini; tindak lanjut keamanan perlu dilakukan tersendiri.
- Driver PostgreSQL mengeluarkan peringatan deprecation mengenai query bersamaan pada satu client; tes tetap lulus.
- Neraca memerlukan pemeriksaan saldo awal/modal/saldo laba, uang muka dan kelengkapan tagihan oleh pengelola. Penghentian/pelepasan aset serta laporan akrual penuh belum ditambahkan.
- Tidak ada deployment, commit atau push. Server aplikasi QA dan cluster PostgreSQL QA telah dihentikan setelah pengujian.
