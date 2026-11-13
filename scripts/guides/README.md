# Sumber buku panduan pengguna

`build_guide.py` menghasilkan PDF yang dipakai tombol **Unduh Panduan**:
`output/pdf/buku-panduan-cv-ihsan-mandiri.pdf`.

Edisi 2 bertanggal 13 November 2026 mencakup 31 halaman, termasuk pengeluaran
terhubung ke pesanan, pencarian/ganti/lepas pesanan, Master Aset, pembelian aset
tertaut, penyusutan, koreksi/penghentian, laba setelah penyesuaian, dan ekspor.

Jalankan dari direktori proyek dengan Python yang memiliki `reportlab` dan `pypdf`:

```powershell
python scripts/guides/build_guide.py
```

Script memakai font Arial Windows dan sumber `source-edisi-1.pdf` untuk menjaga
bab lama yang tidak berubah, termasuk gambar simulasi potong kertas. Jangan
menimpa sumber edisi pertama dengan hasil keluaran. Semua bab yang terdampak
fitur baru dibangun ulang, beserta sampul, daftar isi, penomoran, bookmark,
dan tautan navigasi. Script tidak mengakses database.

Setelah memperbarui isi, render dan periksa semua halaman. Pastikan setiap bab
tetap satu halaman, contoh hitungan benar, dan tautan daftar isi menuju bab
yang tepat. Endpoint `/api/guide` memakai path keluaran yang sama, sehingga
tidak memerlukan perubahan route untuk mengganti edisi panduan.
