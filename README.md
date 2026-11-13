# Percetakan CV Ihsan Mandiri

Aplikasi internal percetakan dengan **Next.js App Router 16.4.4, TypeScript, React 19, Prisma 7.10.1, dan Neon PostgreSQL**. Node.js minimal 22.12; pengujian memakai Node 24.21.0 dan npm 11.19.0. Versi paket terpasang dibukukan di `package-lock.json`; gunakan `npm ci` pada instalasi berikutnya.

Tersedia login/logout admin, kategori produk/jasa dua level, pos pengeluaran, **manajemen permintaan cetak**, **Buku Kas**, **saldo pembukaan**, **dashboard dari database**, serta **Budgeting HPP dan Canvas potong kertas**. Daftar pesanan/kas mendukung filter URL, pagination, soft-delete, dan ekspor Excel/CSV seluruh hasil filter. Dashboard diperbarui setelah mutasi, saat kembali ke tab, dan otomatis setiap 15 detik selama tab terlihat. Budgeting menyimpan seluruh komponen dan snapshot perhitungan, dengan keuntungan persen/nominal. Shell responsif berbahasa Indonesia. Laporan lengkap berbasis kas tersedia pada `/laporan`, dengan rincian produk, tiga kelompok beban, arus kas, analitik pos serta ekspor Excel enam worksheet dan CSV terstruktur. Tidak ada COA, jurnal, ledger, neraca posisi keuangan, atau payment gateway.

Dokumen sumber tetap ada di [docs/README.md](docs/README.md). Baca [keputusan fondasi](docs/09-keputusan-teknis-tahap-1.md), [bukti tahap 1](docs/10-hasil-uji-tahap-1.md), [hasil tahap 2](docs/11-implementasi-dan-uji-tahap-2.md), [hasil tahap 3](docs/12-implementasi-dan-uji-tahap-3.md), serta [keputusan dan bukti tahap 4](docs/13-implementasi-dan-uji-tahap-4.md).

## Setup lingkungan

1. Tentukan dahulu target database: **development** pada branch Neon khusus pengembangan atau **production** pada branch/database perusahaan. Jangan memakai database aplikasi untuk integration test.
2. Instal paket dengan `npm.cmd ci`. Pada PowerShell, `.cmd` menghindari hambatan execution policy pada `npm.ps1`; `npm` biasa juga boleh jika bekerja.
3. Jika `.env` belum ada, salin `.env.example` ke `.env`. **Jangan menimpa `.env` yang sudah Anda isi.** Isi variabel berikut melalui editor atau secret manager, jangan menaruh rahasia pada argumen command/history:

| Variabel              | Pengisian                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | Connection string Neon **pooled**, host `-pooler`, dari branch target. Pertahankan SSL, disarankan `sslmode=verify-full`. |
| `DIRECT_URL`          | Connection string **direct** dari branch, database, dan pengguna yang sama; digunakan CLI migrasi.                        |
| `DB_TARGET`           | `development` atau `production`, sesuai keputusan pada langkah 1. Wrapper migrasi, bootstrap, dan seed mewajibkannya.     |
| `APP_ORIGIN`          | `http://localhost:3000` untuk lokal; origin `https://domain-anda` tanpa path untuk deployment.                            |
| `AUTH_SECRET`         | Secret acak minimal 32 karakter; gunakan secret berbeda tiap lingkungan.                                                  |
| `SEED_ADMIN_EMAIL`    | Email akun admin pertama. Tidak ada sign-up publik atau akun demo.                                                        |
| `SEED_ADMIN_PASSWORD` | 12–128 karakter, mencakup huruf besar/kecil, angka, dan simbol.                                                           |
| `TEST_DATABASE_URL`   | Opsional: database/branch TEST terpisah dari `DATABASE_URL`.                                                              |

Untuk menghasilkan secret acak (salin hasilnya ke `AUTH_SECRET`, jangan commit):

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

4. Setelah target dan env benar, tinjau enam migration dalam `prisma/migrations`. Migration ketiga menambahkan kunci idempotensi kas; migration keempat menambahkan snapshot budgeting dan memperlebar tipe hasil potong/per-unit agar tidak overflow. Migration kelima (`20261112010000_expense_order_link`) mengizinkan pengeluaran ditautkan ke pesanan melalui kolom yang sudah ada, dengan mengganti satu constraint dalam transaksi SQL tanpa mengubah atau menghapus data lama. Terapkan migration ini sebelum menjalankan versi aplikasi yang mendukung tautan pengeluaran. Untuk **kedua target** gunakan deploy migration versioned berikut; tidak ada reset atau sinkronisasi schema destruktif:

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run admin:create
```

Bootstrap hanya membuat admin pertama. Pengulangan tidak mengubah email/password yang sudah ada. Setelah bootstrap sukses, hapus `SEED_ADMIN_PASSWORD` dari lingkungan runtime dan simpan kredensial admin dengan aman. Jangan mengulang bootstrap dengan ekspektasi mereset password.

5. Jika ingin master contoh, jalankan **secara eksplisit** pada target terpilih:

```powershell
npm.cmd run seed
```

Seed hanya menambahkan contoh kategori dan pos, tanpa pesanan, budget, transaksi kas, atau saldo pembukaan. Setelah pernah sukses, seed tidak menimpa edit pengguna atau memunculkan kembali contoh yang dihapus. Semua master dapat diubah/hapus melalui UI; yang sudah dirujuk akan diarsipkan.

6. Jalankan lokal:

```powershell
npm.cmd run dev
```

Buka [halaman masuk](http://localhost:3000/login). Login memerlukan database yang sudah dimigrasi dan akun admin; tidak ada bypass ketika env/database belum siap.

Untuk deployment yang sudah memiliki env production, gunakan `npm.cmd run build`, lalu `npm.cmd start`. Hosting harus mendukung runtime Node.js dan HTTPS. Build tidak menjalankan migration, seed, ataupun bootstrap secara otomatis.

## Pemeriksaan

```powershell
npm.cmd run db:validate
npm.cmd run lint
npm.cmd run typecheck
npx.cmd --no-install tsc --noEmit
npm.cmd test
npm.cmd run build
```

Build memakai Webpack secara eksplisit. Generate client, typegen, unit test, lint, dan build tidak membutuhkan database aktif. Folder `src/generated/prisma` dibuat saat instalasi/generate dan tidak perlu di-commit.

Integration test database memerlukan PostgreSQL/Neon TEST yang sudah mendapat keenam migration. **Migration dan seed untuk uji tidak pernah otomatis diarahkan ke database aplikasi.** Pada shell khusus pengujian, set `TEST_DATABASE_URL` ke database TEST dan biarkan `DATABASE_URL` menunjuk database aplikasi yang berbeda. Jalankan:

```powershell
npm.cmd run test:integration
```

Test database membuat fixture pesanan/kas/budget untuk membuktikan perhitungan, filter, ekspor, soft-delete, dan perlindungan referensi, lalu membersihkan fixture miliknya. Uji saldo mengganti sementara pengaturan pembukaan pada database TEST dan memulihkannya setelah uji. Test seed sengaja mengubah/menghapus contoh pada **database TEST**. Gunakan database uji khusus tanpa pengguna lain; jangan gunakan data perusahaan.

Test HTTP tambahan berjalan jika `TEST_BASE_URL`, `TEST_ADMIN_EMAIL`, dan `TEST_ADMIN_PASSWORD` tersedia. Server pada `TEST_BASE_URL` harus memakai database TEST dan akun uji yang sudah di-bootstrap. Pengujian mencakup pembatasan login; menjalankannya berkali-kali dapat membatasi akun uji selama jendela 15 menit. Tanpa variabel yang diperlukan, suite terkait ditandai **SKIP**, bukan bukti PASS integrasi. Ekspor dalam test dibaca kembali dengan parser CSV dan ExcelJS; bukan sekadar memeriksa status HTTP.

## Rute tahap 1–5

| Rute                                                                     | Perilaku                                                                                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `/login`                                                                 | Masuk admin, tanpa registrasi.                                                                                      |
| `/dashboard`                                                             | Pesanan bulan WIB berjalan, antrean Diproses lintas tanggal, kas masuk/keluar/selisih dan saldo periode dari DB.    |
| `/buku-kas`                                                              | Daftar desktop/mobile, filter gabungan URL, ringkasan seluruh hasil, pagination dan hapus dengan konfirmasi.        |
| `/buku-kas/baru`, `/buku-kas/[id]/edit`                                  | Form pemasukan/pengeluaran, pos wajib, kategori penjualan, pesanan opsional dan alokasi kuantitas.                  |
| `/pengaturan`                                                            | Nominal dan tanggal efektif saldo pembukaan; konfirmasi perubahan bila ada transaksi.                               |
| `/permintaan`                                                            | Daftar desktop/mobile, filter gabungan URL, pagination, status cepat dan konfirmasi hapus.                          |
| `/permintaan/baru`, `/permintaan/[id]/edit`                              | Form pesanan, kategori cascading, tanggal WIB, total desimal real-time yang dihitung ulang server.                  |
| `/kategori-produk`                                                       | CRUD kategori utama/sub, pencarian, filter status, arsip, dan pratinjau cascading.                                  |
| `/pos-pengeluaran`                                                       | CRUD pos Produksi/Operasional/Marketing, pencarian, filter status, arsip.                                           |
| `/api/categories`, `/api/categories/[id]`                                | GET/POST koleksi dan PATCH/DELETE item; wajib sesi server.                                                          |
| `/api/expense-posts`, `/api/expense-posts/[id]`                          | GET/POST koleksi dan PATCH/DELETE item; wajib sesi server.                                                          |
| `/api/auth/login`, `/api/auth/logout`                                    | POST saja, verifikasi origin; logout mencabut sesi dari database.                                                   |
| `/api/orders`, `/api/orders/[id]`, `/api/orders/[id]/status`             | Baca/tambah, baca/edit/soft-delete, dan status cepat; seluruh operasi wajib sesi server.                            |
| `/api/exports/orders?format=xlsx` atau `format=csv`                      | Ekspor seluruh hasil filter aktif; wajib sesi server, pagination tabel tidak membatasi ekspor.                      |
| `/api/cash-transactions`, `/api/cash-transactions/[id]`                  | GET/POST koleksi dan GET/PATCH/DELETE item; sesi server, validasi silang, idempotensi tambah dan revisi edit/hapus. |
| `/api/cash-opening`                                                      | GET pengaturan dan PUT pembukaan; tidak membuat transaksi pendapatan.                                               |
| `/api/dashboard`, `/api/finance/summary?start=YYYY-MM-DD&end=YYYY-MM-DD` | Agregasi kas aktif, Decimal akurat, periode inklusif, tanpa harga pesanan/HPP.                                      |
| `/api/orders/[id]/allocation`                                            | Sisa kuantitas yang belum dialokasikan pada penerimaan kas; server memeriksa ulang saat menyimpan.                  |
| `/api/exports/cash?format=xlsx` atau `format=csv`                        | Seluruh hasil filter kas, termasuk di luar halaman tabel; wajib sesi server.                                        |

Seluruh halaman data memeriksa sesi di server. Seluruh API master, pesanan, kas, pengaturan, agregasi, alokasi dan ekspor juga memeriksa sesi secara mandiri sebelum membaca body atau mengakses data. Query menggunakan Prisma dan validasi Zod server; mutasi wajib origin sesuai `APP_ORIGIN`.

## Menggunakan permintaan cetak

1. Buka **Permintaan Cetak → Tambah permintaan**. Tanggal default hari ini WIB. Isi pelanggan, kategori/subkategori aktif, jumlah, satuan, harga satuan, status dan catatan.
2. Jumlah menerima maksimal tiga desimal (misalnya `1,5` meter). Harga satuan berupa Rupiah utuh tanpa pemisah ribuan, misalnya `2000`. Total `250 × 2000` tampil Rp500.000 dan dihitung ulang di server; 0,5 Rupiah dibulatkan ke atas.
3. Simpan, lalu gunakan dropdown pada baris/kartu untuk mengganti status. Menu Ubah membuka detail lengkap. Hapus menampilkan konfirmasi; record historis dipertahankan dan transaksi kas/budget terkait tidak dihapus.
4. Isi filter, lalu tekan **Terapkan filter**. Pencarian mencakup pelanggan, kode, nama kategori/produk historis maupun nama master saat ini. Kategori arsip tetap tersedia pada filter histori. **Reset filter** kembali ke seluruh permintaan aktif.
5. Gunakan **Excel (.xlsx)** atau **CSV (.csv)** untuk mengunduh seluruh hasil sesuai filter yang **sudah diterapkan**, termasuk halaman lain. CSV memakai UTF-8 BOM, escape kutip/baris baru, dan mitigasi formula injection. XLSX menyimpan teks sebagai teks; angka lebih dari 15 digit signifikan disimpan sebagai teks agar tidak berubah akibat batas presisi Excel.

Nama kategori/produk lama tidak berubah ketika master diganti nama atau diarsipkan. Edit pesanan dengan kategori historis yang sama tetap diperbolehkan; pesanan baru harus memakai master aktif. Konflik edit dari sesi lain meminta pengguna memuat ulang. Nilai pesanan dan status Diambil tidak otomatis mencatat penerimaan kas atau menandakan lunas.

## Menggunakan Buku Kas dan saldo pembukaan

1. Buka **Pengaturan Kas**. Isi saldo riil sebelum transaksi pertama dan tanggal efektifnya, lalu **Simpan saldo awal**. Nominal boleh `0`; kosong berarti belum dikonfigurasi. Saldo pembukaan tidak masuk pemasukan. Bila sudah ada transaksi, perubahan memerlukan centang konfirmasi. Tanggal efektif tidak boleh setelah transaksi aktif pertama.
2. Buka **Buku Kas → Catat transaksi**. Tanggal default hari ini WIB. Isi keterangan dan jumlah Rupiah utuh tanpa pemisah ribuan, misalnya `400000`; jumlah harus lebih dari nol. Tanggal tidak boleh sebelum pembukaan.
3. Pilih **Pengeluaran**, lalu pilih pos aktif. Kelompok Produksi/Operasional/Marketing disimpan sebagai snapshot. Mengubah kelompok master tidak mengubah transaksi lama; mengganti pos pada transaksi akan mengambil kelompok pos baru.
4. Untuk **Pemasukan**, pilih **Penjualan** dan kategori/subkategori, atau **Lain-lain**. Pada penjualan, pesanan boleh dicari dan dipilih secara opsional. Kategori harus sama dengan pesanan; memilih pesanan tidak menyalin harga atau kuantitas secara otomatis.
5. Kuantitas terjual boleh kosong jika belum diketahui. Untuk pesanan 100 pcs, DP bisa dicatat dengan kuantitas `0` dan pelunasan `100`, atau dibagi sesuai realisasi. Server menolak alokasi yang melebihi jumlah pesanan, termasuk saat dua admin menyimpan bersamaan. Jumlah pesanan tidak dapat diturunkan di bawah alokasi aktif, dan satuan tidak dapat diganti setelah ada alokasi. Nominal penerimaan tetap sesuai uang riil yang diterima.
6. Simpan. Jika koneksi terputus, coba kembali pada **form yang sama**: kunci permintaan mencegah transaksi ganda. Dua transaksi yang sengaja dibuat melalui form terpisah tetap merupakan dua pencatatan; periksa daftar sebelum membuat form baru untuk pembayaran yang sama.
7. Filter jenis + pos + tanggal + keterangan, lalu **Terapkan filter**. Ringkasan dan ekspor menghitung seluruh hasil yang cocok. **Reset filter** mengembalikan daftar aktif. Ubah/hapus mengubah ringkasan sesuai tanggal transaksi; hapus memerlukan konfirmasi dan menyimpan record historis.
8. Buka **Dashboard**. Pesanan dihitung dari tanggal pesanan bulan berjalan; antrean Diproses mencakup semua tanggal. Pemasukan/pengeluaran dihitung dari Buku Kas aktif saja. Saldo awal periode = pembukaan + kas bersih sebelumnya; saldo akhir = saldo awal + kas masuk − kas keluar. Saldo awal/akhir belum ditampilkan bila pembukaan belum diatur atau awal periode mendahului tanggal efektifnya; arus kas tetap ditampilkan dengan jujur.

Tidak ada variabel env baru untuk tahap 3–4. Koneksi Neon dan migrasi pada lingkungan pengguna tetap perlu diverifikasi; hasil PostgreSQL TEST lokal bukan bukti koneksi Neon atau kesiapan deployment production.

## Menggunakan Budgeting HPP dan potong kertas

| Rute | Perilaku |
| --- | --- |
| `/budgeting` | Riwayat, cari judul/produk/pelanggan/kode, filter kategori/sub/tanggal dibuat WIB, pagination, detail/edit/hapus. |
| `/budgeting/baru` | Estimasi baru dengan kategori, pesanan opsional, komponen fleksibel, kalkulator dan Canvas. |
| `/budgeting/[id]` | Detail seluruh komponen, HPP, harga rekomendasi, dan snapshot dua orientasi; preview tidak mengubah data tersimpan. |
| `/budgeting/[id]/edit` | Muat nilai lama, edit dan simpan seluruh baris/snapshot dalam satu transaksi. |
| `/api/budgets`, `/api/budgets/[id]` | GET/POST koleksi dan GET/PATCH/DELETE item, autentikasi server, validasi Zod dan perhitungan ulang server. |

1. Buka **Budgeting → Buat estimasi**. Isi judul, kategori/subkategori, jumlah produk positif dan satuan. Opsional cari pesanan; memilihnya menyalin kategori, jumlah dan satuan estimasi. Jumlah estimasi tetap dapat disesuaikan tanpa mengubah pesanan asli.
2. Untuk menghitung bahan, centang **Sertakan simulasi potong pada estimasi**. Isi empat ukuran dalam cm, maksimal dua desimal (`20,5` atau `20.5`). Tombol **Isi contoh 107 × 80** hanya mengisi contoh ketika Anda memilihnya.
3. Hasil asli dan diputar sama-sama terlihat. Contoh 107×80 dipotong 26×20,5 menghasilkan asli **12**, sisa X/Y **3/18,5 cm**, waste **2.164 cm²**; diputar **15**, sisa **4,5/2 cm**, waste **565 cm²**. Sistem memilih yield terbesar; seri memilih asli. Gunakan **Preview asli/diputar** untuk memilih orientasi yang ditampilkan/digunakan. Tidak ada kerf, bleed atau orientasi campuran.
4. Klik **Gunakan untuk biaya bahan**, isi jumlah produk yang dipotong (bilangan bulat) dan harga per plano dalam Rupiah utuh. Untuk 100 produk dengan yield 15 dan harga `10000`, preview menunjukkan **7 plano, Rp70.000, kelebihan 5**. Tekan **Konfirmasi biaya bahan** untuk memasukkannya ke komponen. Sebelum konfirmasi, komponen belum berubah. Konfirmasi ulang memperbarui satu baris yang sama.
5. Bila ukuran/orientasi/jumlah/harga plano berubah setelah biaya dipindahkan, konfirmasi ulang agar baris bahan sesuai, atau pilih **Jadikan biaya manual**. Pilihan manual memungkinkan angka biaya diubah sendiri. Yield 0 tidak dapat dipakai menghitung bahan. Melepas simulasi mempertahankan biaya yang sudah dipindahkan sebagai biaya manual.
6. **Tambah komponen biaya** sesuai kebutuhan: bahan/kertas, tinta/plat/cetak, finishing, mesin/tenaga kerja atau komponen lain. Isi nama, jumlah dan harga satuan. Hapus baris yang tidak diperlukan. Setiap subtotal dibulatkan HALF_UP ke Rupiah, lalu dijumlahkan menjadi HPP. Estimasi tanpa komponen memiliki HPP 0 dengan penjelasan yang jelas.
7. Pilih **Tambah keuntungan di atas HPP (%)** atau **Tambah keuntungan nominal (Rp)**. Contoh HPP Rp500.000 untuk 100 pcs menghasilkan HPP/unit Rp5.000. Markup 20% atau keuntungan total Rp100.000 sama-sama memberi rekomendasi total Rp600.000 dan Rp6.000/unit. Persentase merupakan markup atas HPP. Tampilan per-unit dibulatkan langsung dari total/jumlah ke dua desimal.
8. **Simpan estimasi**, lalu buka detail dari riwayat. Komponen, nama produk/pesanan saat pencatatan, parameter dan hasil potong disimpan. Ubah memuat nilai lama dan menyimpan atomik; konflik edit meminta muat ulang. Hapus memerlukan konfirmasi dan mempertahankan record historis.
9. Gunakan filter riwayat, lalu **Terapkan filter**; **Reset filter** kembali ke seluruh estimasi aktif. Tanggal riwayat berdasarkan waktu dibuat dalam WIB. Setiap akses data dan mutasi dilindungi sesi server.

Menyimpan, mengubah atau menghapus budget **tidak mencatat kas**, mengubah harga pesanan, ataupun menandakan pembayaran. Pengeluaran nyata tetap dicatat melalui Buku Kas. Laporan tahap 5 memakai transaksi kas aktif dan pembukaan, tanpa mengambil uang dari nilai pesanan atau estimasi HPP.

## Laporan lengkap dan serah terima

| Rute | Fungsi |
| --- | --- |
| `/laporan` | Bulan/tahun atau rentang tanggal, ringkasan, pendapatan historis kategori/sub, OTHER, beban, laba/rugi kas, saldo dan analitik pos. |
| `/api/reports` | JSON periode yang sama, angka Decimal sebagai string; wajib sesi, tanpa cache publik. |
| `/api/exports/reports?format=xlsx` atau `format=csv` | Laporan lengkap sesuai periode; wajib sesi; fingerprint revisi opsional, UI selalu mengirimkannya untuk mendeteksi perubahan sejak layar dibuka. |

Laporan memakai satu transaksi snapshot `RepeatableRead`. Saldo pembukaan tidak menjadi pendapatan; nilai pesanan/HPP tidak menjadi kas. Kuantitas terjual dijumlah dari penerimaan kas per satuan, nol eksplisit dipertahankan, kosong diberi penjelasan. DP/pelunasan tidak menyalin ulang kuantitas pesanan. Nama kategori historis dan kelompok biaya snapshot dipertahankan.

Ekspor XLSX berisi **Ringkasan, Pendapatan, Pengeluaran, Arus Kas, Analitik Pos, Penyusutan**, dengan metadata periode, header beku, format Rupiah/persen, dan angka besar sebagai teks agar presisi tidak hilang. CSV UTF-8 BOM/CRLF berisi delapan bagian dalam 13 kolom; kontrak baris, aturan subtotal dan cara impor dijelaskan pada [panduan pengguna](docs/08-deploy-dan-user-guide.md#kontrak-csv-laporan). Teks formula dinetralkan, termasuk awalan kontrol/invisible. Ekspor ditolak dengan 409 bila revisi layar sudah berubah; muat ulang dan unduh kembali.

**Deployment dilakukan manual oleh pemilik ke Vercel + Neon; tidak dilakukan oleh agent.** Ikuti [setup, deploy manual, backup/restore dan panduan semua menu](docs/08-deploy-dan-user-guide.md). Build command `npm run build` sudah menjalankan Prisma generate dan Webpack; migrasi dan bootstrap dijalankan terpisah terhadap target yang sudah dipastikan benar. Jangan memasukkan migration/seed ke build Vercel. `APP_ORIGIN` harus persis domain HTTPS yang dipakai; preview memerlukan branch/origin/secret terpisah. Perubahan env memerlukan deployment baru.

[Hasil QA akhir dan matriks FR/RPT/OPS/SEC/UX](docs/14-hasil-qa-dan-serah-terima.md) membedakan PASS lokal dari verifikasi Neon/HTTPS/HP sungguhan yang belum dilakukan. Bukti unduhan dan screenshot berasal dari database TEST lokal, bukan data produksi. Audit npm runtime masih melaporkan dependency moderate pada rantai ExcelJS; detail dan batas penilaiannya dicatat di laporan. Tidak ada perubahan skema/migration pada tahap 5.


## Master Aset dan penyusutan

Menu `/aset` menyimpan nama aset, harga perolehan, tanggal siap digunakan, dan masa pakai dalam bulan. Metode garis lurus dengan nilai sisa nol: harga perolehan dibagi masa pakai. Beban satu bulan penuh diakui pada tanggal terakhir bulan sejak bulan siap digunakan; rentang tanggal yang belum mencapai akhir bulan tidak memuat beban bulan tersebut. Selisih pembulatan kumulatif memastikan total penyusutan tepat sama dengan harga perolehan. Penyusutan berhenti setelah masa pakai habis atau setelah bulan terakhir digunakan, tanpa menghapus riwayat aset.

Pembelian yang telah dibayar melalui Buku Kas dapat ditautkan ke aset: satu transaksi pengeluaran aktif dengan nominal sama untuk satu aset. Pengeluaran tersebut tetap mengurangi kas, tetapi dikeluarkan dari beban saat menghitung laba rugi agar tidak dihitung dua kali bersama penyusutan. Untuk aset lama yang dibeli sebelum aplikasi digunakan, tautan dapat dikosongkan. Pembayaran pembelian secara cicilan belum didukung oleh tautan ini.

Koreksi aset menghitung ulang laporan periode terkait; periksa bukti pembelian dan tanggal sebelum menyimpan. Saldo kas dan transaksi lama tidak diubah otomatis. Transaksi pembelian tertaut dilindungi dari penghapusan/perubahan nominal atau jenis; koreksi atau lepaskan tautan melalui Master Aset terlebih dahulu.

Laporan dan ekspor CSV/Excel memisahkan selisih kas, pembelian aset tertaut, beban penyusutan nonkas, dan laba/rugi setelah penyesuaian. Excel memiliki worksheet tambahan `Penyusutan`. Laporan ini tetap menggunakan basis kas untuk pendapatan/biaya lainnya, belum merupakan laporan akrual penuh. Penyusutan tidak menjadi penerimaan modal atau penyisihan uang otomatis.

Sebelum menjalankan versi ini pada database yang dituju, terapkan migration versioned `20261113010000_fixed_assets` melalui `npm.cmd run db:migrate:deploy` setelah memastikan `DB_TARGET`, `DATABASE_URL`, dan `DIRECT_URL` sesuai target. Migration hanya menambahkan tabel aset beserta constraint dan relasinya; tidak melakukan reset, seed, atau mengubah isi transaksi lama.


## Buku panduan edisi 2

Tombol **Unduh Panduan** tetap memakai `output/pdf/buku-panduan-cv-ihsan-mandiri.pdf`.
Edisi 2 (13 November 2026) berisi 31 halaman, dengan bab pengeluaran terkait pesanan,
pencarian/ganti/lepas pesanan, Master Aset, pembelian aset tertaut, penyusutan,
koreksi/penghentian, contoh selisih kas versus laba, serta ekspor enam worksheet.
Daftar isi, bookmark dan tautan kembali sudah mengikuti nomor halaman baru.
Cara membangun ulang dan sumber PDF lama ada di `scripts/guides/README.md`.
