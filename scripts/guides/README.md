# Sumber buku panduan pengguna

`build_guide.py` menghasilkan PDF yang dipakai tombol **Unduh Panduan**:
`output/pdf/buku-panduan-cv-ihsan-mandiri.pdf`.

Edisi 4 bertanggal 13 November 2026 mencakup 40 halaman. Delapan bab
Hutang-Piutang menjelaskan daftar/status, piutang dari pesanan, hutang pemasok,
angsuran/pelunasan, DP lama, koreksi, pembatalan/pelepasan tautan, serta latihan
saldo kas. Bab Buku Kas juga menjelaskan perlindungan pembayaran tertaut agar
uang yang sama tidak dicatat dua kali.

Bab ekspor menjelaskan sembilan worksheet laporan, ekspor khusus tagihan dan
riwayat pembayaran, CSV laporan 40 kolom, CSV tagihan 27 kolom, referensi
tagihan dalam Buku Kas, serta posisi historis sampai akhir periode.

Bab pengeluaran terhubung pesanan, Master Aset, pembelian aset tertaut,
penyusutan, laba setelah penyesuaian, Budgeting, dan ekspor tetap tersedia.

Jalankan dari direktori proyek dengan Python yang memiliki `reportlab` dan `pypdf`:

```powershell
python scripts/guides/build_guide.py
```

Script memakai font Arial Windows dan sumber `source-edisi-1.pdf` untuk menjaga
bab lama yang tidak berubah, termasuk gambar simulasi potong kertas. Jangan
menimpa sumber edisi pertama dengan hasil keluaran. Semua bab yang terdampak
fitur baru dibangun ulang, beserta sampul, daftar isi, penomoran, bookmark,
dan tautan navigasi. Jumlah halaman daftar isi menyesuaikan jumlah bab.
Script tidak mengakses database.

Setelah memperbarui isi, render dan periksa semua halaman. Pastikan setiap bab
tetap satu halaman, contoh hitungan benar, dan tautan daftar isi menuju bab
yang tepat. Endpoint `/api/guide` memakai path keluaran yang sama, sehingga
tidak memerlukan perubahan route untuk mengganti edisi panduan.
