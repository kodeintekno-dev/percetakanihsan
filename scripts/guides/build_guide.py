"""Rebuild edition 4, preserving unaffected chapters from the edition 1 source PDF.

Run with Python containing reportlab and pypdf. No application/database access.
"""
from pathlib import Path
from io import BytesIO
import re
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ContentStream, NameObject, ArrayObject
from pypdf.annotations import Link

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).with_name('source-edisi-1.pdf')
OUTPUT = ROOT / 'output/pdf/buku-panduan-cv-ihsan-mandiri.pdf'
TMP = ROOT / 'tmp/pdfs'
TMP.mkdir(parents=True, exist_ok=True)
W, H = 595.2756, 841.8898
GREEN, INK, MUTED = '#145d4b', '#193c32', '#526c63'
for name, file in [('Arial', 'arial.ttf'), ('Arial-Bold', 'arialbd.ttf'), ('Arial-Italic', 'ariali.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(Path('C:/Windows/Fonts') / file)))
styles = {
    'body': ParagraphStyle('body', fontName='Arial', fontSize=10.8, leading=16.2, textColor=INK, spaceAfter=10),
    'title': ParagraphStyle('title', fontName='Arial-Bold', fontSize=23, leading=28, textColor=GREEN, spaceAfter=11),
    'lead': ParagraphStyle('lead', fontName='Arial', fontSize=11, leading=16.2, textColor=MUTED, spaceAfter=16),
    'small': ParagraphStyle('small', fontName='Arial', fontSize=9.2, leading=13.5, textColor=MUTED, spaceAfter=6),
    'step': ParagraphStyle('step', fontName='Arial', fontSize=10.8, leading=16.2, textColor=INK, spaceAfter=11),
    'th': ParagraphStyle('th', fontName='Arial-Bold', fontSize=9.5, leading=13.5, textColor=GREEN),
    'cell': ParagraphStyle('cell', fontName='Arial', fontSize=10.1, leading=14.5, textColor=INK),
}
def p(text, style='body'):
    return Paragraph(text, styles[style])
def steps(items):
    return [p(f'<b>{i}. {title}</b><br/>{body}', 'step') for i, (title, body) in enumerate(items, 1)]
def table(headers, rows, widths=None):
    data = [[p(x, 'th') for x in headers]] + [[p(str(x), 'cell') for x in row] for row in rows]
    obj = Table(data, colWidths=widths or [((W-96)/len(headers))]*len(headers), hAlign='LEFT')
    obj.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#eaf3ec')),
        ('VALIGN', (0,0), (-1,-1), 'TOP'), ('LEFTPADDING',(0,0),(-1,-1),10),
        ('RIGHTPADDING',(0,0),(-1,-1),10), ('TOPPADDING',(0,0),(-1,-1),8),
        ('BOTTOMPADDING',(0,0),(-1,-1),8),
        ('LINEBELOW',(0,0),(-1,0),0.7,colors.HexColor('#c6d9cc')),
        ('LINEBELOW',(0,1),(-1,-1),0.35,colors.HexColor('#e2ebe4')),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white, colors.HexColor('#fafcf9')]),
    ]))
    return [obj, Spacer(1,13)]
def note(title, body):
    obj=Table([[p(f'<b>{title}</b><br/>{body}')]], colWidths=[W-96])
    obj.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#eaf3ed')),('BOX',(0,0),(-1,-1),0.5,colors.HexColor('#d7e5da')),('LEFTPADDING',(0,0),(-1,-1),13),('RIGHTPADDING',(0,0),(-1,-1),13),('TOPPADDING',(0,0),(-1,-1),12),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
    return [KeepTogether(obj), Spacer(1,12)]
def header(c, doc, group):
    c.setFillColor(colors.HexColor(GREEN));c.rect(0,H-6,W,6,fill=1,stroke=0)
    c.setFont('Arial-Bold',8);c.drawString(48,H-45,'CV IHSAN MANDIRI  /  PANDUAN PENGGUNA')
    c.setFont('Arial',8);c.drawRightString(W-48,H-45,group)
def new_page(title, group, lead, body):
    stream=BytesIO()
    doc=SimpleDocTemplate(stream,pagesize=(W,H),leftMargin=48,rightMargin=48,topMargin=76,bottomMargin=75)
    doc.build([p(title,'title'),p(lead,'lead'),*body],onFirstPage=lambda c,d:header(c,d,group),onLaterPages=lambda c,d:header(c,d,group))
    reader=PdfReader(BytesIO(stream.getvalue()))
    if len(reader.pages)!=1:
        raise ValueError(f'Chapter overflow: {title}: {len(reader.pages)} pages')
    return reader.pages[0]

# Each original topic remains in the revised book. Only affected chapters are rewritten.
base=PdfReader(SOURCE)
if len(base.pages)!=21: raise ValueError('Expected the original 21-page source')
chapters=[]
def old(n,title,group): chapters.append((title,group,base.pages[n-1]))
def add(title,group,lead,body): chapters.append((title,group,new_page(title,group,lead,body)))

add('Masuk dan menjelajahi aplikasi','MULAI',
    'Gunakan akun admin yang disiapkan pengelola. Nama menu dan tombol dalam buku mengikuti aplikasi.',
    steps([
      ('Masuk ke ruang kerja','Buka alamat aplikasi, isi <b>Email admin</b> dan <b>Password</b>, lalu tekan <b>Masuk ke ruang kerja</b>. Ikon mata membantu memeriksa ketikan. Dashboard tampil setelah berhasil masuk.'),
      ('Buka menu yang diperlukan','Di desktop, gunakan sidebar kiri. Di HP, ketuk ikon tiga garis di bilah atas. <b>Hutang-Piutang</b> berada di bawah Buku Kas dan berisi dua tab.'),
      ('Unduh panduan dan keluar','Tombol <b>Unduh Panduan</b> berada di bilah atas. Buka hasil dari daftar unduhan browser. Setelah bekerja, gunakan ikon <b>Keluar</b> di bagian akun pada menu.'),
    ]) + table(['Menu','Digunakan untuk'],[
      ['Permintaan Cetak / Budgeting','Mencatat pesanan pelanggan serta memperkirakan HPP dan kebutuhan bahan.'],
      ['Buku Kas / Hutang-Piutang','Mencatat uang nyata serta memantau tagihan pelanggan dan pemasok berikut pembayarannya.'],
      ['Master Aset / Laporan','Mencatat aset, menghitung penyusutan, dan membaca laporan kas serta laba setelah penyesuaian.'],
      ['Kategori / Pos / Pengaturan Kas','Menyiapkan kategori produk, pos pengeluaran, serta tanggal dan saldo pembukaan.'],
    ],[180,W-276]) + note('Mulai pertama kali','Siapkan Kategori Produk, Pos Pengeluaran, dan Pengaturan Kas. Catat pesanan serta transaksi usaha yang sebenarnya. Menyimpan tagihan saja tidak menambah atau mengurangi uang.'))
old(4,'Membaca Dashboard','MULAI')
old(5,'Kategori Produk & Jasa','PENGATURAN')
old(6,'Pos Pengeluaran','PENGATURAN')
old(7,'Saldo awal kas','PENGATURAN')
old(8,'Mencatat permintaan cetak','OPERASIONAL')
add('Mengelola dan mengekspor pesanan','OPERASIONAL',
    'Cari dan perbarui pesanan dari menu Permintaan Cetak. Perubahan harus tetap sesuai dengan pembayaran dan tagihan yang sudah tercatat.',
    steps([
      ('Cari dan tampilkan','Cari kode, pelanggan atau produk. Gabungkan filter kategori, subkategori, status dan tanggal, lalu tekan <b>Terapkan filter</b>. Gunakan halaman berikutnya jika hasil banyak.'),
      ('Koreksi rincian','Buka <b>Ubah</b>, perbaiki rincian dan simpan. Kategori pesanan yang sudah terkait kas tidak dapat diganti. Jumlah dan satuan juga mengikuti batas alokasi kuantitas yang sudah dicatat.'),
      ('Perbarui tahap pekerjaan','Gunakan status Baru, Diproses, Selesai atau Diambil sesuai kondisi pekerjaan. Mengubah status pekerjaan tidak mencatat pembayaran atau membuat tagihan otomatis.'),
      ('Hapus jika memang salah','Penghapusan menyimpan riwayat dan tidak menghapus kas/budget terkait. Jika ada tagihan Hutang-Piutang aktif, batalkan tagihannya dengan prosedur yang benar terlebih dahulu.'),
      ('Unduh daftar','Terapkan filter, lalu pilih <b>Excel</b> atau <b>CSV</b>. Hasil mencakup seluruh pesanan yang sesuai, bukan hanya halaman yang sedang terlihat.'),
    ]) + note('Pesanan dengan piutang aktif','Pelanggan, kategori, jumlah, satuan dan harga dilindungi. Tanggal pesanan tidak boleh melewati tanggal tagihan. Koreksi atau batalkan tagihan beserta pembayarannya terlebih dahulu jika data tersebut salah.'))
add('Mencatat uang masuk dan keluar','BUKU KAS',
    'Catat hanya uang yang benar-benar diterima atau dibayar. Menyimpan pesanan, estimasi HPP, aset, atau tagihan tidak membuat transaksi kas otomatis.',
    steps([
      ('Buka formulir','Pilih <b>Buku Kas &gt; Catat transaksi</b>. Isi tanggal, keterangan, dan nominal Rupiah utuh lebih dari nol. Ketik <b>400000</b> untuk Rp400.000.'),
      ('Penerimaan penjualan','Pilih <b>Pemasukan &gt; Penjualan</b>. Pilih kategori/subkategori atau cari pesanan melalui <b>Hubungkan pesanan</b>. Pemilihan pesanan menyesuaikan kategori, tanpa menyalin nominal dan kuantitas terjual.'),
      ('Penerimaan lain-lain','Pilih <b>Pemasukan &gt; Lain-lain</b> untuk penerimaan selain penjualan. Jenis ini tidak memakai tautan pesanan atau kuantitas produk.'),
      ('Pembayaran biaya','Pilih <b>Pengeluaran</b> dan pos aktif, misalnya Kertas / Produksi. <b>Hubungkan pesanan</b> juga tersedia pada jenis ini dan boleh dikosongkan untuk biaya umum.'),
      ('Simpan dan periksa','Tekan <b>Simpan transaksi</b>. Cocokkan tanggal, jenis, nominal, pos, serta kode dan pelanggan pesanan tertaut dengan bukti transaksi.'),
    ]) + note('Jangan menggandakan pencatatan','Menghubungkan transaksi ke pesanan tidak mencatat pembayaran kedua kali. Jika pembayaran dibuat lewat <b>Hutang-Piutang &gt; Catat pembayaran</b>, transaksi Buku Kas sudah dibuat otomatis. Jangan memasukkan uang yang sama lagi secara manual.'))

add('Menghubungkan pengeluaran ke pesanan','BUKU KAS',
    'Pos menjawab "biaya jenis apa?". Pesanan menjawab "biaya ini untuk pekerjaan siapa?". Satu transaksi pengeluaran dapat ditautkan ke satu pesanan.',
    steps([
      ('Siapkan pengeluaran','Di <b>Buku Kas &gt; Catat transaksi</b>, pilih <b>Pengeluaran</b>. Isi keterangan, jumlah dan pos pengeluaran.'),
      ('Cari pesanan','Buka kolom <b>Cari pesanan</b>. Pesanan terbaru tampil. Ketik nama pelanggan, produk, atau kode; hasil dicari otomatis. Tombol <b>Cari</b> atau Enter juga dapat digunakan.'),
      ('Periksa dan pilih','Baca pelanggan, kode, produk, jumlah, status, tanggal, serta nilai pesanannya. Pilih hasil yang benar. Daftar menutup dan kartu <b>Pesanan terhubung</b> muncul.'),
      ('Pastikan biaya tetap benar','Pos dan nominal pengeluaran tetap Anda tentukan sendiri. <b>Nilai pesanan</b> pada kartu adalah harga pesanan pelanggan, bukan nominal biaya yang harus dibayar.'),
      ('Simpan dan telusuri','Tekan <b>Simpan transaksi</b>. Kode pesanan dan pelanggan terlihat pada daftar Buku Kas. Kolom Pesanan pada ekspor Excel/CSV memuat kodenya. Buka Ubah untuk memeriksa tautannya kembali.'),
    ]) + note('Contoh','Beli kertas Rp400.000 untuk pesanan Pak Budi: pilih pos Kertas, cari pesanan Pak Budi, lalu simpan. Pembelian tetap mengurangi kas Rp400.000 satu kali. Menghubungkan biaya belum otomatis membuat laporan laba per pesanan.'))

add('Ganti, lepas, dan cari pesanan','BUKU KAS',
    'Komponen yang sama digunakan untuk pemasukan penjualan dan pengeluaran manual. Tautan pesanan dapat diperbaiki jika transaksi tidak sedang tertaut ke pembayaran Hutang-Piutang.',
    steps([
      ('Mengganti pesanan','Buka Ubah transaksi, tekan <b>Ganti pesanan</b>, lalu cari dan pilih pengganti. Pesanan lama tetap terhubung selama belum ada pengganti yang dipilih. <b>Batal ganti</b> menutup pencarian tanpa mengganti pesanan.'),
      ('Melepas hubungan','Tekan <b>Lepaskan</b>, lalu <b>Simpan transaksi</b>. Ini hanya melepas tautan. Nominal kas dan pesanan asli tetap ada.'),
      ('Menggunakan keyboard','Di kolom pencarian, gunakan panah atas/bawah untuk menyorot hasil. Tekan Enter untuk memilih hasil yang disorot. Escape menutup hasil. Enter pada pencarian tidak menyimpan formulir transaksi.'),
      ('Mencari hasil lain','Gunakan navigasi halaman jika hasil banyak. Tombol silang pada kolom mengosongkan pencarian. Jika tidak ada hasil, coba nama, kode, atau produk yang lebih singkat.'),
    ]) + note('Untuk biaya bersama','Listrik bulanan atau sewa dapat disimpan tanpa pesanan. Jika satu pembelian digunakan untuk beberapa pesanan, jangan menyalin seluruh nominal ke setiap pesanan. Bila perlu dipisah, total seluruh bagian harus tepat sama dengan pembayaran sebenarnya.') +
    [p('Pesanan dengan tagihan Hutang-Piutang aktif tidak dapat dihapus. Pesanan lainnya dapat dihapus tanpa menghapus kas terkait. Mengaitkan pengeluaran tidak menghabiskan kuantitas terjual pada pesanan.','small')])

add('DP, pelunasan, dan kuantitas','BUKU KAS',
    'Contoh pada halaman ini memakai pencatatan manual di Buku Kas. Jika memakai Hutang-Piutang, gunakan alur pembayaran di bab tagihan dan jangan memasukkan uang yang sama lagi.',
    steps([
      ('Pilih pemasukan penjualan','Cari dan pilih pesanan pelanggan. Periksa kategori, satuan dan kuantitas pesanannya.'),
      ('Isi alokasi secara sadar','Saat memilih pesanan, aplikasi memeriksa sisa <b>Belum dialokasikan</b>. Isi kuantitas dan satuan bersama-sama, atau kosongkan keduanya jika belum diketahui.'),
      ('Catat DP dan pelunasan terpisah','Contoh pesanan 100 pcs senilai Rp1.200.000: gunakan alokasi seperti tabel agar jumlah unit tidak dihitung dua kali.'),
    ]) + table(['Penerimaan','Nominal','Alokasi unit'],[
      ['DP','Rp480.000','0 pcs'],['Pelunasan','Rp720.000','100 pcs'],['Hasil laporan','Rp1.200.000','100 pcs; 2 transaksi; 1 pesanan'],
    ],[105,120,W-321]) + note('Kosong berbeda dari nol','Kosong berarti belum diketahui; nol berarti sengaja belum mengalokasikan unit pada penerimaan itu. Total alokasi aktif tidak boleh melebihi jumlah pesanan. Pengeluaran tertaut tidak mengikuti alokasi penjualan ini.'))

add('Mengelola dan mengekspor Buku Kas','BUKU KAS',
    'Periksa transaksi yang tersimpan, telusuri pesanan, lalu cocokkan pengeluaran dan penerimaan dengan bukti yang dimiliki.',
    steps([
      ('Terapkan filter','Gabungkan keterangan, jenis, pos dan rentang tanggal. Tekan <b>Terapkan filter</b>. Ringkasan memakai seluruh hasil filter, bukan hanya satu halaman.'),
      ('Periksa hubungan pesanan','Pada transaksi tertaut, kode pesanan dan pelanggan tampil bersama rincian. Tautan dapat dibuka untuk melihat pesanan. Tidak semua transaksi wajib memiliki pesanan.'),
      ('Koreksi dan simpan','Pilih ikon <b>Ubah</b>. Perbaiki data, pesanan tertaut, atau lepas tautannya, lalu simpan. Buka ulang untuk memeriksa hasil. Perubahan kas menghitung ulang laporan.'),
      ('Ekspor seluruh hasil','Pilih <b>Excel (.xlsx)</b> atau <b>CSV (.csv)</b>. Cocokkan jumlah hasil, nominal, dan kolom Pesanan. Ekspor mencakup hasil di halaman berikutnya.'),
    ]) + note('Transaksi tertaut dilindungi','Untuk pembayaran Hutang-Piutang, pilih <b>Buka tagihan</b>; koreksi lewat riwayat pembayaran. Transaksi pembelian aset tidak bisa dihapus atau diubah nominal/jenisnya sebelum tautan diperbaiki di <b>Master Aset &gt; Koreksi</b>.') +
    [p('Jika koneksi terputus saat menyimpan, periksa daftar sebelum membuat formulir baru. Mencoba kembali pada formulir yang sama membantu mencegah transaksi ganda.','small')])

add('Mengenal menu Hutang-Piutang','TAGIHAN',
    'Menu Hutang-Piutang berada di sidebar di bawah Buku Kas. Gunakan tab Piutang Pelanggan untuk tagihan pelanggan dan Hutang Pemasok untuk tagihan bahan atau jasa yang belum dibayar.',
    table(['Yang dilihat','Cara membacanya'],[
      ['Sisa piutang / hutang','Total tagihan aktif dikurangi pembayaran yang sudah dicatat atau ditautkan.'],
      ['Lewat jatuh tempo','Sisa tagihan yang tanggal jatuh temponya sudah lewat. Tagihan jatuh tempo hari ini belum diberi tanda terlambat.'],
      ['Jatuh tempo 7 hari ke depan','Sisa tagihan yang jatuh tempo dalam tujuh hari mendatang, termasuk hari ini.'],
      ['Status pembayaran','Belum dibayar, Dibayar sebagian, atau Lunas. Tanda Lewat jatuh tempo dapat tampil bersama status yang belum lunas.'],
      ['Cari dan tampilkan','Cari nomor tagihan, nama pihak atau kode pesanan. Pilih status, lalu tekan Tampilkan. Dibatalkan menampilkan riwayat tagihan yang dibatalkan.'],
    ],[155,W-251]) + note('Ringkasan dan daftar','Kartu ringkasan mengikuti tab dan pencarian untuk seluruh tagihan aktif. Filter status hanya membatasi daftar. Gunakan Detail untuk membuka rincian dan riwayat pembayaran; gunakan navigasi halaman jika hasil banyak.') +
    [p('<b>Perbedaan penting:</b> tagihan mencatat kewajiban membayar. Membuat tagihan tidak mengubah saldo kas. Tombol <b>Excel (.xlsx)</b> dan <b>CSV (.csv)</b> mengunduh seluruh hasil filter yang sudah ditampilkan, termasuk halaman berikutnya, beserta riwayat pembayarannya.','small')])

add('Membuat piutang dari pesanan pelanggan','TAGIHAN',
    'Buat tagihan pelanggan dari pesanan yang sudah tersimpan. Pelanggan dan total tagihan mengikuti pesanan; satu pesanan hanya memiliki satu piutang aktif.',
    steps([
      ('Buka Tambah piutang','Pilih <b>Hutang-Piutang &gt; Piutang Pelanggan &gt; Tambah piutang</b>.'),
      ('Hubungkan pesanan','Pada <b>Hubungkan pesanan</b>, cari kode, nama pelanggan atau produk, lalu pilih hasil yang benar. Nama pelanggan dan total tagihan terisi dari pesanan dan tidak diketik ulang.'),
      ('Isi nomor serta tanggal','Isi <b>Nomor tagihan</b>, <b>Tanggal tagihan</b>, dan <b>Jatuh tempo</b>. Tanggal tagihan tidak boleh sebelum tanggal pesanan; jatuh tempo tidak boleh sebelum tanggal tagihan. Catatan boleh dikosongkan.'),
      ('Simpan nilai penuh','Tekan <b>Simpan piutang</b>. Untuk pesanan Rp2.000.000, total tagihan tetap Rp2.000.000 meskipun sudah menerima DP Rp800.000. Hubungkan DP tersebut dari detail, sehingga sisa menjadi Rp1.200.000.'),
      ('Periksa detail','Cocokkan pelanggan, nomor pesanan, total dan jatuh tempo. Saat pertama disimpan, tagihan belum memiliki pembayaran. Tidak ada pemasukan Buku Kas baru sampai pembayaran dicatat.'),
    ]) + note('Periksa tagihan yang sudah ada','Jika pesanan sudah memiliki piutang aktif, buka tagihan tersebut dari daftar. Jangan membuat pesanan salinan hanya untuk menghindari pesan duplikat. Pesanan baru tidak otomatis dibuatkan tagihan.'))

add('Membuat hutang kepada pemasok','TAGIHAN',
    'Gunakan tab Hutang Pemasok untuk nota pembelian bahan atau jasa yang belum selesai dibayar. Siapkan nama pemasok, nota, total, dan jatuh tempo.',
    steps([
      ('Buka Tambah hutang','Pilih <b>Hutang-Piutang &gt; Hutang Pemasok &gt; Tambah hutang</b>.'),
      ('Isi pihak dan nomor nota','Isi <b>Nama pemasok</b> serta <b>Nomor tagihan</b> dari nota pemasok. Nomor yang sudah pernah digunakan untuk jenis tagihan yang sama tidak dapat dipakai ulang.'),
      ('Isi tanggal dan nominal penuh','Isi tanggal tagihan, jatuh tempo dan <b>Total tagihan (Rp)</b>. Untuk nota Rp1.500.000, ketik <b>1500000</b>, meski yang dibayar pertama hanya Rp500.000.'),
      ('Pilih pos, hubungkan jika perlu','Pilih <b>Pos pengeluaran</b>, misalnya Pembelian bahan / Produksi. Hubungkan pesanan jika nota khusus satu pekerjaan; tautan ini boleh kosong untuk biaya umum. Isi catatan bila perlu.'),
      ('Simpan dan periksa','Tekan <b>Simpan hutang</b>. Detail menunjukkan total Rp1.500.000, dibayar Rp0, dan sisa Rp1.500.000. Pembayaran Rp500.000 nanti dicatat dari detail agar sisa menjadi Rp1.000.000.'),
    ]) + note('Ruang lingkup','Fitur ini untuk tagihan bahan/jasa, belum untuk pinjaman uang atau cicilan aset. Pembayaran hutang bahan/jasa tidak ditautkan sebagai pembelian aset. Pilih pos dengan benar sebelum menyimpan.'))

add('Mencatat angsuran dan pelunasan baru','TAGIHAN',
    'Gunakan Catat pembayaran ketika uang benar-benar baru diterima dari pelanggan atau baru dibayarkan ke pemasok. Aplikasi membuat transaksi Buku Kas secara otomatis.',
    steps([
      ('Buka tagihan','Pilih <b>Detail</b> pada tagihan, periksa sisanya, lalu tekan <b>Catat pembayaran</b>.'),
      ('Isi tanggal pembayaran','Gunakan tanggal uang diterima atau dibayar, bukan sekadar tanggal janji. Pembayaran baru tidak boleh sebelum tanggal tagihan atau tanggal pembukaan kas.'),
      ('Isi nominal yang benar','Masukkan Rupiah utuh lebih dari nol, maksimal sebesar sisa. Tekan <b>Isi sebesar sisa tagihan</b> untuk pelunasan. Catatan boleh dikosongkan.'),
      ('Periksa dampak sebelum menyimpan','Baca penjelasan pemasukan/pengeluaran dan sisa setelah pembayaran. Contoh piutang tersisa Rp1.200.000 dibayar Rp500.000: sisa menjadi Rp700.000.'),
      ('Simpan sekali dan cek riwayat','Tekan <b>Simpan pembayaran</b>. Periksa riwayat dan <b>Lihat di Buku Kas</b>. Piutang membuat pemasukan penjualan; hutang membuat pengeluaran. Jangan mencatat uang yang sama lagi secara manual.'),
    ]) + note('Tidak menghitung jumlah produk berulang','Angsuran otomatis tidak menyalin kuantitas pesanan ke setiap penerimaan. Laporan dapat menandai kuantitas sebagai belum dicatat. Jika koneksi terputus, periksa riwayat dahulu dan coba kembali pada formulir yang sama.'))

add('Menghubungkan DP atau pembayaran lama','TAGIHAN',
    'Jika uang sudah ada di Buku Kas, gunakan Hubungkan pembayaran lama. Cara ini mengurangi sisa tagihan tanpa menambah atau mengurangi uang untuk kedua kalinya.',
    steps([
      ('Periksa sebelum membuat pembayaran baru','Contoh DP Rp800.000 sudah tercatat untuk pesanan Rp2.000.000. Buat tagihan nilai penuh dahulu, kemudian buka detailnya.'),
      ('Cari transaksi lama','Tekan <b>Hubungkan pembayaran lama</b>. Cari keterangan transaksi, lalu tekan <b>Cari</b>. Gunakan Sebelumnya/Berikutnya jika hasil lebih dari satu halaman.'),
      ('Pilih transaksi yang sesuai','Periksa tanggal, keterangan, dan nominal. Untuk piutang, transaksi harus pemasukan penjualan dengan kategori dan pesanan yang sesuai. Untuk hutang, pos/kelompok pengeluaran dan pesanan harus sesuai.'),
      ('Hubungkan dan cocokkan','Pilih transaksi, isi catatan bila perlu, lalu tekan <b>Hubungkan transaksi</b>. DP Rp800.000 membuat sisa Rp1.200.000; saldo kas tetap seperti sebelum penautan.'),
    ]) + table(['Syarat tambahan','Artinya'],[
      ['Aktif dan belum tertaut','Transaksi tidak dihapus, tidak sedang dipakai tagihan lain, serta bukan transaksi pembelian aset tertaut.'],
      ['Nominal ditautkan utuh','Satu transaksi untuk satu tagihan. Nominalnya tidak boleh melebihi sisa; pembagian satu transaksi ke beberapa tagihan belum didukung.'],
      ['DP sebelum tanggal tagihan','Dapat ditautkan jika sudah ada di Buku Kas dan memenuhi syarat. Jangan membuat DP baru hanya untuk mengganti tanggalnya.'],
    ],[150,W-246]))

add('Mengoreksi rincian tagihan','TAGIHAN',
    'Gunakan Koreksi tagihan untuk kesalahan rincian, seperti nomor, catatan atau jatuh tempo. Perubahan rincian tidak membuat pembayaran Buku Kas baru.',
    steps([
      ('Buka formulir koreksi','Dari <b>Detail</b>, tekan <b>Koreksi tagihan</b>. Periksa kembali nomor, tanggal, jatuh tempo dan catatan.'),
      ('Sesuaikan hanya data yang diizinkan','Pelanggan dan total piutang mengikuti pesanan. Pada hutang, nama pemasok dan total dapat diperbaiki, tetapi total tidak boleh di bawah jumlah pembayaran aktif.'),
      ('Perhatikan tautan dan tanggal','Pesanan dan pos pengeluaran dipertahankan saat koreksi. Tanggal tagihan tidak boleh sebelum pesanan atau melewati pembayaran baru yang sudah dicatat. DP lama yang ditautkan dapat bertanggal lebih awal.'),
      ('Simpan lalu periksa kembali','Tekan <b>Simpan piutang</b> atau <b>Simpan hutang</b>. Cocokkan total, dibayar dan sisa. Bila data berubah di sesi lain, muat ulang dan tinjau lagi sebelum mengoreksi.'),
    ]) + note('Jika pesanan atau pos yang dipilih salah','Batalkan atau lepaskan seluruh pembayaran dari riwayat, lalu batalkan tagihan. Buat tagihan baru dengan nomor baru dan tautan yang benar. Transaksi lama yang dilepas dapat ditautkan kembali jika sesuai.') +
    [p('Pesanan dengan piutang aktif dilindungi dari perubahan pelanggan, kategori, jumlah, satuan dan harga. Pesanan dengan tagihan aktif tidak dapat dihapus. Pos yang sudah dipakai tagihan diarsipkan saat dihapus, sehingga riwayat tetap ada.','small')])

add('Membatalkan pembayaran atau tagihan','TAGIHAN',
    'Lakukan dari detail tagihan dan baca dampaknya sebelum mengonfirmasi. Pembatalan membutuhkan alasan dan riwayatnya tetap ditampilkan.',
    table(['Tombol','Dampak yang terjadi'],[
      ['Batalkan pembayaran','Untuk pembayaran yang dibuat dari tagihan: sisa bertambah kembali dan transaksi Buku Kas yang dibuat bersamanya ikut dinonaktifkan.'],
      ['Lepaskan tautan','Untuk transaksi lama: sisa bertambah kembali, tetapi transaksi Buku Kas lama tetap aktif. Saldo kas tidak berubah.'],
      ['Batalkan tagihan','Mengeluarkan tagihan dari daftar aktif. Seluruh pembayaran harus dibatalkan atau dilepas lebih dahulu. Nomor tagihan lama tetap dicadangkan.'],
    ],[145,W-241]) + steps([
      ('Pilih pada riwayat pembayaran','Untuk nominal yang salah, pilih <b>Batalkan pembayaran</b>. Untuk transaksi lama yang salah dipilih, gunakan <b>Lepaskan tautan</b>.'),
      ('Isi alasan dan konfirmasi','Baca penjelasan di layar, isi alasan, lalu tekan tombol <b>Ya, ...</b> yang sesuai. Periksa sisa dan status sesudahnya. Pembayaran baru yang benar dapat dicatat lagi jika diperlukan.'),
      ('Batalkan tagihan jika diperlukan','Setelah pembayaran aktif kosong, pilih <b>Batalkan tagihan</b>, isi alasan, lalu <b>Ya, batalkan tagihan</b>. Cari riwayatnya melalui status <b>Dibatalkan</b> di daftar.'),
    ]) + note('Jangan menghapus dari Buku Kas langsung','Kas yang masih tertaut dilindungi. Gunakan <b>Buka tagihan</b> di Buku Kas dan lakukan koreksi dari riwayat pembayaran agar nominal kas dan sisa tagihan tetap cocok.'))

add('Latihan Hutang-Piutang dan saldo kas','TAGIHAN',
    'Lakukan pada lingkungan latihan tanpa data lain, dengan saldo awal Rp20.000.000. Semua transaksi contoh berada dalam bulan laporan yang sama dan tidak ada penyusutan.',
    steps([
      ('Siapkan pesanan dan DP lama','Buat pesanan pelanggan Rp2.000.000, lalu catat DP penjualan Rp800.000 di Buku Kas satu kali dengan pesanan yang sama. Saldo menjadi Rp20.800.000.'),
      ('Buat piutang dan tautkan DP','Simpan piutang Rp2.000.000. Dari detail, hubungkan DP Rp800.000 tadi. Sisa piutang Rp1.200.000; saldo tetap Rp20.800.000.'),
      ('Catat pelunasan baru','Dari tagihan, catat pembayaran Rp1.200.000. Piutang menjadi Lunas, sisa nol. Total penerimaan pelanggan Rp2.000.000 dan saldo Rp22.000.000.'),
      ('Catat hutang dan angsur','Buat hutang bahan Rp1.500.000. Simpan tagihan tidak mengubah kas. Catat pembayaran Rp500.000 dari detail: sisa hutang Rp1.000.000 dan saldo Rp21.500.000.'),
    ]) + table(['Yang diperiksa','Hasil akhir contoh'],[
      ['Piutang / hutang tersisa','Rp0 / Rp1.000.000'],
      ['Kas masuk / kas keluar','Rp2.000.000 / Rp500.000'],
      ['Selisih kas / saldo akhir','Rp1.500.000 / Rp21.500.000'],
    ],[205,W-301]) + note('Tagihan belum dibayar belum masuk laba/rugi','Sisa hutang Rp1.000.000 belum menjadi kas keluar atau beban pada laporan berbasis kas ini. Daftar tagihan tidak membuat laporan akrual penuh. Tagihan pelanggan sebelum penyerahan pesanan juga perlu dibaca sesuai tahap pekerjaannya.'))

old(13,'Membuat estimasi HPP','PRODUKSI')
old(14,'Simulasi potong kertas','PRODUKSI')
old(15,'Biaya bahan dan harga jual','PRODUKSI')
old(16,'Riwayat estimasi HPP','PRODUKSI')

add('Mengenal Master Aset dan penyusutan','ASET',
    'Buka menu Master Aset untuk mencatat mesin/peralatan dan membagi biaya pemakaiannya selama masa pakai. Halaman ini berjudul Aset &amp; Penyusutan.',
    table(['Istilah','Arti sederhana'],[
      ['Harga perolehan','Nilai biaya untuk memperoleh aset yang Anda catat. Contoh: mesin Rp24.000.000.'],
      ['Masa pakai','Perkiraan lama pemakaian dalam bulan. Empat tahun berarti 48 bulan.'],
      ['Penyusutan','Bagian harga perolehan yang dihitung sebagai biaya pemakaian pada periode laporan.'],
      ['Akumulasi penyusutan','Jumlah seluruh penyusutan sampai akhir periode yang dihitung.'],
      ['Nilai buku','Harga perolehan dikurangi akumulasi penyusutan. Bukan taksiran harga jual mesin.'],
    ],[135,W-231]) + note('Rumus yang dipakai','Garis lurus, nilai sisa nol: <b>harga perolehan / masa pakai dalam bulan</b>. Mesin Rp24.000.000 / 48 bulan menghasilkan Rp500.000 per bulan. Nilai sisa nol berarti seluruh harga dialokasikan selama masa pakainya.') +
    [p('Menyimpan Master Aset tidak membuat uang keluar, uang masuk, atau setoran modal. Penyusutan dihitung otomatis saat laporan periode dibuka; tidak perlu dicatat lagi sebagai Pengeluaran di Buku Kas.','small')])

add('Menambah aset dan memeriksa hasil','ASET',
    'Gunakan data mesin/peralatan yang benar-benar dimiliki. Siapkan nilai perolehan, tanggal siap digunakan dan perkiraan masa pakainya.',
    steps([
      ('Buka Master Aset','Pilih <b>Master Aset</b> di navigasi. Di HP, buka menu tiga garis terlebih dahulu. Gunakan formulir <b>Tambah aset</b>.'),
      ('Isi empat data utama','Nama aset: Mesin Cetak Digital. Harga perolehan (Rp): <b>24000000</b>. Mulai siap digunakan: <b>13/11/2026</b>. Masa pakai (bulan): <b>48</b>.'),
      ('Periksa pembelian','Jika pembayaran pembelian sudah dicatat di Buku Kas, tautkan transaksinya seperti bab berikut. Untuk aset lama yang dibeli sebelum aplikasi digunakan, tautan dapat dikosongkan.'),
      ('Simpan aset','Tekan <b>Simpan aset</b>. Periksa pesan berhasil dan kartu pada <b>Daftar aset</b>. Harga dan masa pakai harus sesuai bukti serta perkiraan penggunaan.'),
      ('Baca prakiraan akhir bulan','Untuk November 2026, contoh ini menunjukkan penyusutan Rp500.000, akumulasi Rp500.000, serta nilai buku Rp23.500.000. Angka kartu adalah prakiraan akhir bulan berjalan.'),
    ]) + note('Periksa periode','Buka Laporan dan pilih November 2026 untuk mencocokkan angka. Aset yang mulai digunakan pada bulan lain baru menghasilkan penyusutan pada bulan penggunaannya.'))

add('Menautkan pembelian aset di Buku Kas','ASET',
    'Tautan ini menghubungkan satu aset dengan satu pembayaran pembeliannya. Ini berbeda dari menghubungkan biaya ke pesanan pelanggan.',
    steps([
      ('Catat uang yang dibayarkan','Jika belum dicatat, buka <b>Buku Kas &gt; Catat transaksi &gt; Pengeluaran</b>. Contoh keterangan Beli mesin cetak, jumlah Rp24.000.000, dengan pos pengeluaran yang sesuai. Simpan sekali.'),
      ('Cari pada formulir aset','Buka Master Aset. Pada <b>Transaksi pembelian di Buku Kas (opsional)</b>, ketik keterangan pembayaran, lalu tekan <b>Cari transaksi</b>.'),
      ('Pilih transaksi yang benar','Pilih di <b>Pengeluaran pembelian</b>. Hanya pengeluaran aktif yang belum ditautkan ke aset lain atau pembayaran Hutang-Piutang yang muncul. Hasil dibatasi 20 transaksi terbaru; persempit pencarian untuk transaksi lama.'),
      ('Cocokkan nominal','Memilih transaksi mengisi harga perolehan dari nominal pembayaran. Satu transaksi untuk satu aset, dengan nominal yang sama. Jangan memilih pembelian kertas produksi untuk dijadikan pembelian mesin.'),
      ('Simpan dan periksa laporan','Tekan <b>Simpan aset</b>. Kas keluar tetap ada. Di laba/rugi, pembelian tertaut dikeluarkan dari beban penuh dan diganti penyusutan sesuai periode.'),
    ]) + note('Batas penggunaan','Tautan ini mendukung satu transaksi pembayaran penuh. Penggabungan beberapa pembayaran/cicilan belum didukung. Jangan membuat pembayaran kedua hanya untuk mendapatkan tautan.'))

add('Koreksi, penghentian, dan periode','ASET',
    'Perubahan data aset menghitung ulang laporan periode terkait. Periksa kembali tanggal dan nilai sebelum menyimpan koreksi.',
    steps([
      ('Koreksi data atau tautan','Di kartu aset, tekan <b>Koreksi</b>. Perbaiki nama, harga, tanggal, masa pakai atau pilihan pembelian. Untuk melepas pembelian, pilih <b>Tanpa tautan transaksi kas</b>. Simpan aset atau pilih Batal koreksi.'),
      ('Catat terakhir digunakan','Pada kartu aset, isi <b>Terakhir digunakan (opsional)</b>, lalu tekan <b>Simpan penghentian</b>. Tanggal tidak boleh lebih awal dari mulai digunakan. Aset tetap disimpan.'),
      ('Kembali ke masa pakai semula','Kosongkan tanggal terakhir digunakan dan simpan penghentian. Aplikasi kembali mengikuti masa pakai semula. Periksa dampaknya pada laporan lama.'),
    ]) + table(['Aturan','Contoh hasil'],[
      ['Mulai dipakai di tengah bulan','Mulai 13 November: November dihitung satu bulan penuh pada 30 November. Tidak dibagi per hari.'],
      ['Rentang belum sampai akhir bulan','Rentang berakhir 20 November belum memuat penyusutan November. Laporan bulan November menggunakan 1-30 November.'],
      ['Bulan penghentian ikut dihitung','Terakhir dipakai 15 Desember: Desember masih satu bulan penuh; Januari berikutnya tidak lagi disusutkan.'],
      ['Batas dan pembulatan','Setelah masa pakai habis, beban berhenti. Selisih pembulatan Rupiah disesuaikan agar total tidak melebihi harga perolehan.'],
    ],[160,W-256]))

add('Memilih periode dan membaca pendapatan','LAPORAN',
    'Halaman Laporan Keuangan: Kas &amp; Penyusutan menggabungkan kas tercatat dan perhitungan aset untuk periode yang Anda pilih.',
    steps([
      ('Tetapkan periode','Pilih <b>Bulan dan tahun</b> atau <b>Rentang tanggal</b>, lalu <b>Terapkan periode</b>. Periksa tanggal mulai dan selesai di judul. Batas tanggal ikut dihitung.'),
      ('Baca empat kartu kas dan pesanan','Kas masuk, Kas keluar dan Selisih berasal dari Buku Kas. Pesanan masuk dihitung dari tanggal pesanan. Penyusutan tidak mengubah kartu kas tersebut.'),
      ('Periksa pendapatan per produk','Baca kategori/produk, jumlah transaksi penerimaan, pesanan tertaut unik, kuantitas per satuan, serta kas masuk. Pemasukan lain-lain ditampilkan terpisah.'),
      ('Periksa laba dan tagihan','Baca laba/rugi dengan penyusutan serta <b>Hutang-Piutang per akhir periode</b>. Sisa tagihan memasukkan tagihan lama; pembayaran setelah akhir periode belum mengurangi sisanya. Koreksi/pembatalan mengikuti data aktif terkini.'),
      ('Perbarui setelah koreksi','Gunakan <b>Perbarui laporan</b> sesudah perubahan kas atau aset. Pilih <b>Reset ke bulan berjalan</b> untuk kembali ke periode awal.'),
    ]) + note('Batas laporan','Pendapatan dan biaya lain masih mengikuti kas tercatat. DP yang diterima bisa masuk kas meski pesanan belum selesai; tagihan yang belum dibayar belum menjadi kas. Laporan ini belum merupakan laporan akrual penuh.'))

add('Kas, saldo, dan analitik pengeluaran','LAPORAN',
    'Bedakan selisih uang dalam suatu periode dari jumlah uang yang tersedia pada akhir periode. Penyusutan tidak mengubah saldo kas.',
    table(['Bagian','Cara membacanya'],[
      ['Pengeluaran menurut kelompok','Produksi, Operasional dan Marketing menjumlah kas keluar sesuai kelompok saat pencatatan. Pembelian aset tetap masuk rincian kas keluar.'],
      ['Selisih kas','Kas masuk dikurangi kas keluar pada periode. Positif disebut surplus; negatif disebut defisit.'],
      ['Saldo akhir kas','Saldo awal periode + kas masuk - kas keluar. Saldo awal membawa pembukaan dan transaksi sebelum periode sejak tanggal efektif.'],
      ['Analitik pengeluaran per pos','Pos diurutkan dari pengeluaran terbesar. Persentase dihitung terhadap seluruh kas keluar dalam periode.'],
    ],[140,W-236]) + note('Contoh saldo','Kas masuk Rp2.550.000 dan kas keluar Rp938.000 menghasilkan selisih Rp1.612.000. Jika saldo awal Rp5.000.000, saldo akhirnya <b>Rp6.612.000</b>, dengan asumsi semua transaksi sudah dicatat.') +
    [p('Di HP, tabel Rincian harian dapat digeser mendatar untuk melihat kolom kanan. Jika pembukaan belum diisi atau periode dimulai sebelum tanggal efektif, aplikasi menjelaskan bahwa saldo belum dapat dihitung.','small')])

add('Membaca laba/rugi dengan penyusutan','LAPORAN',
    'Angka "uang bersih" perlu diperjelas. Selisih kas adalah uang masuk dikurangi keluar; laba setelah penyesuaian memperhitungkan pembelian aset tertaut dan penyusutan.',
    table(['Baris laporan','Contoh tanpa aset'],[
      ['Pendapatan kas','Rp2.550.000'],['Beban produksi','-Rp938.000'],['Operasional dan marketing','Rp0'],
      ['Selisih kas sebelum penyesuaian','Rp1.612.000'],['Pembelian aset tertaut - dikeluarkan dari beban','+Rp0'],
      ['Beban penyusutan (nonkas)','-Rp0'],['Laba/rugi setelah penyesuaian','Rp1.612.000'],
    ],[300,W-396]) + note('Jika ada mesin Rp24 juta / 48 bulan','Beban penyusutan bulan penuh adalah Rp500.000. Bila tidak ada penyesuaian pembelian pada periode itu, laba menjadi <b>Rp1.112.000</b>. Selisih kas tetap <b>Rp1.612.000</b>.') +
    [p('<b>Rumus:</b> laba setelah penyesuaian = selisih kas + pembelian aset tertaut pada periode - beban penyusutan periode.'),
     p('Nilai Rp0 pada penyusutan dapat berarti belum ada aset tercatat, periode belum mencapai tanggal pengakuan, atau masa penyusutannya sudah berakhir. Periksa Master Aset dan periode laporan.','small')])

add('Mengapa pembelian aset ditambahkan kembali?','LAPORAN',
    'Baris "Pembelian aset tertaut - dikeluarkan dari beban" adalah penyesuaian laba. Tanda tambah di baris ini tidak menambah uang di Buku Kas.',
    steps([
      ('Uang pembelian benar-benar keluar','Contoh beli mesin <b>Rp12.000.000</b>. Catat kas keluar sebesar itu satu kali di Buku Kas.'),
      ('Mesin dipakai lebih dari satu bulan','Catat di Master Aset: harga Rp12.000.000, masa pakai <b>24 bulan</b>, dan tautkan transaksi pembelian. Penyusutan satu bulan = <b>Rp500.000</b>.'),
      ('Hindari beban dihitung dua kali','Perhitungan awal memakai seluruh kas keluar, termasuk harga mesin. Maka Rp12.000.000 ditambahkan kembali dalam perhitungan laba untuk membatalkan beban penuh, lalu Rp500.000 dikurangkan sebagai biaya pemakaian bulan tersebut.'),
    ]) + table(['Yang terjadi','Dampak'],[
      ['Buku Kas','Tetap menunjukkan pembayaran mesin Rp12.000.000. Tidak ada penerimaan Rp12.000.000 baru.'],
      ['Laba/rugi','Beban mesin bulan itu Rp500.000, dengan asumsi bulan penyusutan sudah masuk dalam periode.'],
      ['Nilai buku setelah satu bulan','Rp12.000.000 - Rp500.000 = Rp11.500.000.'],
    ],[130,W-226]) + note('Laba bukan otomatis uang yang bebas diambil','Pertimbangkan kebutuhan produksi berikutnya, DP pelanggan, dan tagihan belum dibayar. Penyusutan juga tidak otomatis membuat dana penggantian mesin atau setoran modal.'))

add('Mengunduh dan membuka hasil ekspor','LAPORAN',
    'Gunakan Excel untuk membaca beberapa worksheet dan CSV untuk mengolah tabel. Buku panduan PDF ini diunduh melalui tombol Unduh Panduan di bilah atas.',
    steps([
      ('Terapkan filter atau periode','Pada Permintaan Cetak/Buku Kas, terapkan filter. Di Hutang-Piutang, pilih tab, cari/filter status lalu <b>Tampilkan</b>. Di Laporan, <b>Terapkan periode</b>. Ekspor mencakup semua halaman hasil.'),
      ('Unduh dan buka','Pilih <b>Excel (.xlsx)</b> atau <b>CSV (.csv)</b>. Jika data berubah sebelum unduhan, perbarui laporan, tinjau angka terbaru, lalu unduh ulang.'),
      ('Cocokkan sumber angkanya','Buku Kas memuat kode/nomor tagihan tertaut. Di laporan, Piutang/Hutang menunjukkan posisi s/d akhir periode; Pembayaran Tagihan hanya pembayaran aktif bertanggal kas dalam periode, termasuk DP lama.'),
    ]) + table(['Format','Isi yang perlu diperiksa'],[
      ['Excel laporan: 9 worksheet','Ringkasan, Pendapatan, Pengeluaran, Arus Kas, Analitik Pos, Penyusutan, Piutang, Hutang, Pembayaran Tagihan.'],
      ['Excel Hutang-Piutang','Tagihan, Pembayaran, Keterangan. Riwayat menyertakan pembayaran dibatalkan/tautan dilepas dengan status dan alasan.'],
      ['CSV laporan: 40 kolom','13 kolom awal tetap. Kolom tagihan/pembayaran ditambahkan; bagian baru: tagihan_piutang, tagihan_hutang, pembayaran_tagihan.'],
      ['CSV Hutang-Piutang: 27 kolom','Saring jenis_baris: TAGIHAN atau PEMBAYARAN. Nilai tagihan tidak diulang pada baris pembayaran. Saring status sebelum menjumlah.'],
    ],[145,W-241]) + note('Agar tidak salah menjumlah','Pembayaran tagihan sudah ada di Buku Kas; jangan dijumlah ulang sebagai kas baru. CSV laporan juga memiliki subtotal: saring bagian/subbagian. Bila tampil satu kolom, impor lewat Data &gt; From Text/CSV, UTF-8, pemisah koma.'))

add('Latihan pesanan, kas, dan laporan','LATIHAN',
    'Lakukan pada lingkungan latihan, dengan periode November 2026 dan tanpa aset lain pada periode tersebut. Jangan mencampurkan contoh ke data usaha nyata.',
    steps([
      ('Siapkan master dan pembukaan','Buat Banner &gt; Banner Outdoor serta pos Kertas / Produksi, Listrik / Operasional, Iklan / Marketing. Atur pembukaan Rp2.000.000 efektif 1 November 2026.'),
      ('Buat pesanan','Catat Banner Outdoor 100 pcs x Rp12.000 untuk Pak Budi. Total pesanan Rp1.200.000. Estimasi HPP boleh dibuat terpisah dan tidak mengubah kas.'),
      ('Catat pembayaran pelanggan','Hubungkan DP Rp480.000 dengan 0 pcs dan pelunasan Rp720.000 dengan 100 pcs ke pesanan tadi. Tambahkan pemasukan Lain-lain Rp100.000.'),
      ('Catat dan hubungkan biaya','Catat Kertas Rp400.000 dan hubungkan ke pesanan Pak Budi. Catat Listrik Rp200.000 dan Iklan Rp100.000 tanpa pesanan. Simpan masing-masing satu kali.'),
      ('Periksa daftar dan ekspor','Pada pengeluaran Kertas, cari kode pesanan dan nama Pak Budi. Buka Ubah untuk memeriksa tautan, lalu buka Laporan November dan unduh Excel.'),
    ]) + note('Angka yang harus cocok','Kas masuk Rp1.300.000; keluar Rp700.000; selisih dan laba tanpa aset Rp600.000; saldo akhir Rp2.600.000. Penjualan menunjukkan 2 transaksi, 1 pesanan unik dan 100 pcs. Tautan biaya kertas tidak menambah pengeluaran kedua kali.'))

add('Latihan aset dan penyesuaian laba','LATIHAN',
    'Gunakan periode latihan terpisah tanpa transaksi/aset lain. Contoh ini memperlihatkan mengapa saldo kas dan laba dapat berbeda.',
    steps([
      ('Siapkan pembukaan dan penerimaan','Atur saldo awal Rp20.000.000. Catat penerimaan penjualan Rp3.000.000 dan biaya produksi Rp1.000.000 dalam bulan latihan.'),
      ('Catat pembelian mesin','Catat kas keluar Rp12.000.000 dengan keterangan Beli mesin latihan. Kas keluar bulan ini menjadi Rp13.000.000.'),
      ('Simpan dan tautkan aset','Di Master Aset, isi Mesin Latihan Rp12.000.000, masa pakai 24 bulan, mulai siap digunakan pada bulan latihan. Cari dan pilih pembayaran pembeliannya, lalu simpan.'),
      ('Buka laporan bulan penuh','Periksa penyesuaian pembelian Rp12.000.000, penyusutan Rp500.000, akumulasi Rp500.000 dan nilai buku Rp11.500.000. Unduh Excel dan buka Penyusutan.'),
    ]) + table(['Pemeriksaan','Hasil'],[
      ['Selisih kas','Rp3.000.000 - Rp13.000.000 = -Rp10.000.000'],
      ['Saldo akhir kas','Rp20.000.000 - Rp10.000.000 = Rp10.000.000'],
      ['Laba setelah penyesuaian','-Rp10.000.000 + Rp12.000.000 - Rp500.000 = Rp1.500.000'],
    ],[160,W-256]) + [p('Tanda tambah pada penyesuaian bukan kas masuk baru. Pembayaran mesin hanya dicatat sekali, sedangkan biaya pemakaiannya dibagi selama masa pakai.','small')])

add('Mengatasi kendala yang umum','BANTUAN',
    'Mulai dari pesan di layar dan data sumber. Minta bantuan pengelola jika konfigurasi aplikasi belum siap; jangan mengisi data semu untuk memaksakan angka.',
    table(['Gejala','Langkah yang dapat dilakukan'],[
      ['Pesanan tidak ditemukan','Coba kode, nama pelanggan atau produk. Periksa apakah pesanan sudah dihapus. Tunggu koneksi, lalu gunakan pencarian kembali.'],
      ['Tautan pesanan salah','Buka Ubah transaksi &gt; Ganti pesanan atau Lepaskan, lalu Simpan transaksi. Periksa kembali daftar.'],
      ['Penyusutan masih nol','Periksa aset, tanggal siap digunakan, masa pakai, tanggal penghentian, dan akhir periode. Rentang sebelum akhir bulan belum memuat beban bulan itu.'],
      ['Pembelian tidak muncul di pilihan','Cari keterangan yang lebih khusus. Pastikan transaksi aktif berjenis Pengeluaran, belum dipakai aset lain, dan nominalnya sesuai. Hasil dibatasi 20 transaksi terbaru.'],
      ['Nominal/hapus kas ditolak','Untuk pembayaran tagihan, gunakan Buka tagihan dan koreksi riwayat pembayaran. Untuk pembelian aset, koreksi tautan di Master Aset dahulu.'],
      ['Saldo belum bisa dihitung','Periksa Pengaturan Kas dan tanggal efektif. Jangan menganggap belum diatur sama dengan nol.'],
      ['Kuantitas melebihi pesanan','Periksa alokasi DP/pelunasan yang sudah tersimpan. Unit yang sama tidak boleh dicatat dua kali.'],
      ['Data berubah atau unduhan gagal','Perbarui halaman dan periksa ulang data. Untuk kas, cek daftar sebelum membuat formulir baru. Periksa daftar unduhan browser.'],
    ],[155,W-251]) + [p('Jika Master Aset atau Hutang-Piutang belum dapat dibuka karena pembaruan belum lengkap, hubungi pengelola untuk menyelesaikan pembaruan aplikasi dan database. Jangan menjalankan reset, seed, atau memasukkan transaksi pengganti. Sebutkan menu, waktu, pesan, dan kode terkait; jangan bagikan password.','small')])

TOC_PAGE_SIZE = 14
TOC_COUNT = (len(chapters) + TOC_PAGE_SIZE - 1) // TOC_PAGE_SIZE
FIRST_CHAPTER_INDEX = 1 + TOC_COUNT
TOTAL = len(chapters) + FIRST_CHAPTER_INDEX
def cover():
    stream=BytesIO();c=canvas.Canvas(stream,pagesize=(W,H))
    c.setFillColor(colors.HexColor('#f4f8f2'));c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(colors.HexColor(GREEN));c.rect(0,H-16,W,16,fill=1,stroke=0)
    c.setFont('Arial-Bold',13);c.drawString(52,H-92,'CV IHSAN MANDIRI')
    y=H-180
    for text in ['Buku Panduan','Pengguna']:
        c.setFont('Arial-Bold',37);c.drawString(52,y,text);y-=48
    c.setFont('Arial',16);c.drawString(52,y-12,'Aplikasi Manajemen Percetakan')
    c.setFont('Arial',11);c.drawString(52,y-40,'Untuk administrator dan operator')
    c.setStrokeColor(colors.HexColor('#b9d2c1'));c.line(52,y-72,W-52,y-72)
    box=Paragraph('<b>Edisi 4 - 13 November 2026</b><br/>Hutang-Piutang, angsuran, dan DP lama<br/>Pengeluaran terhubung ke pesanan<br/>Aset, laporan, dan ekspor yang diperbarui',ParagraphStyle('covernote',fontName='Arial',fontSize=12,leading=21,textColor=INK))
    _,h=box.wrap(W-104,180);box.drawOn(c,52,y-110-h)
    c.setFont('Arial',10);c.drawString(52,100,'Pesanan / Kas / Tagihan / Budgeting / Aset / Laporan')
    c.setFont('Arial',9);c.drawString(52,76,'Contoh dalam buku digunakan pada lingkungan latihan.')
    c.showPage();c.save();return PdfReader(BytesIO(stream.getvalue())).pages[0]
toc_links={}
def toc(part):
    stream=BytesIO();c=canvas.Canvas(stream,pagesize=(W,H));header(c,None,'NAVIGASI')
    c.setFont('Arial-Bold',25);c.setFillColor(colors.HexColor(GREEN));c.drawString(48,H-92,'Daftar isi' + (' - lanjutan' if part else ''))
    c.setFont('Arial',10);c.setFillColor(colors.HexColor(MUTED));c.drawString(48,H-117,'Klik judul untuk membuka bab. Tautan di kaki halaman kembali ke daftar isi.')
    offset=part*TOC_PAGE_SIZE
    entries=chapters[offset:offset+TOC_PAGE_SIZE]
    y=H-160;links=[]
    for j,(title,group,_) in enumerate(entries):
        page_number=offset+j+FIRST_CHAPTER_INDEX+1
        c.setFillColor(colors.HexColor(GREEN));c.setFont('Arial',7.5);c.drawString(48,y,group)
        titlep=Paragraph(escape(title),ParagraphStyle('toc-title',fontName='Arial-Bold',fontSize=10.2,leading=13,textColor=INK))
        _,h=titlep.wrap(W-144,40);titlep.drawOn(c,48,y-6-h)
        c.setFont('Arial',10);c.drawRightString(W-48,y-17,str(page_number))
        links.append(((48,y-8-h,W-44,y+10),page_number-1))
        c.setStrokeColor(colors.HexColor('#e0e9e1'));c.line(48,y-13-h,W-48,y-13-h)
        y-=h+25
    c.setFont('Arial',9);c.setFillColor(colors.HexColor(GREEN))
    if part:
        c.drawString(48,82,'Daftar isi sebelumnya')
        links.append(((48,76,W/2,95),part))
    if part+1<TOC_COUNT:
        c.drawRightString(W-48,82,f'Lanjutan pada halaman {part+3}')
        links.append(((W/2,76,W-48,95),part+2))
    toc_links[part+1]=links
    c.showPage();c.save();return PdfReader(BytesIO(stream.getvalue())).pages[0]

def strip_old_footer(page):
    # Remove the old text footer itself, so text extraction also has correct numbering.
    stream=ContentStream(page.get_contents(),page.pdf)
    new=[];block=None
    for operands,operator in stream.operations:
        if operator==b'BT':block=[(operands,operator)]
        elif block is not None:
            block.append((operands,operator))
            if operator==b'ET':
                texts=[str(args[0]) for args,op in block if op==b'Tj' and args]
                footer=any(t in ('CV Ihsan Mandiri','Daftar isi') or re.fullmatch(r'\d{2} / 21',t) for t in texts)
                if not footer:new.extend(block)
                block=None
        else:new.append((operands,operator))
    if block:new.extend(block)
    stream.operations=new;page.replace_contents(stream)
    if page.get('/Annots'):
        page[NameObject('/Annots')]=ArrayObject([a for a in page['/Annots'] if a.get_object().get('/Subtype')!='/Link'])
    return page

def footer(page,number):
    stream=BytesIO();c=canvas.Canvas(stream,pagesize=(W,H))
    c.setFillColor(colors.white);c.rect(0,0,W,59,fill=1,stroke=0)
    c.setStrokeColor(colors.HexColor('#b9d1c2'));c.line(48,49,W-48,49)
    c.setFont('Arial',8);c.setFillColor(colors.HexColor(MUTED));c.drawString(48,34,'CV Ihsan Mandiri')
    c.setFillColor(colors.HexColor(GREEN));c.drawCentredString(W/2,34,'Daftar isi')
    c.setFillColor(colors.HexColor(MUTED));c.drawRightString(W-48,34,f'{number:02d} / {TOTAL}')
    c.showPage();c.save();page.merge_page(PdfReader(BytesIO(stream.getvalue())).pages[0]);return page

writer=PdfWriter();writer.add_page(cover())
for part in range(TOC_COUNT):writer.add_page(toc(part))
for title,group,page in chapters:
    writer.add_page(page)
    strip_old_footer(writer.pages[-1])
for i,page in enumerate(writer.pages):
    if i:footer(page,i+1);writer.add_annotation(i,Link(rect=(W/2-35,27,W/2+35,43),target_page_index=1))
for page_index,links in toc_links.items():
    for rect,dest in links:writer.add_annotation(page_index,Link(rect=rect,target_page_index=dest))
writer.add_outline_item('Daftar isi',1)
for i,(title,group,_) in enumerate(chapters):writer.add_outline_item(title,i+FIRST_CHAPTER_INDEX)
writer.add_metadata({'/Title':'Buku Panduan Pengguna - CV Ihsan Mandiri - Edisi 4','/Author':'CV Ihsan Mandiri','/Subject':'Hutang-Piutang, pembayaran, DP lama, aset dan ekspor lengkap Excel CSV','/Creator':'CV Ihsan Mandiri - Panduan pengguna'})
for page in writer.pages:
    page.compress_content_streams()
writer.compress_identical_objects(remove_duplicates=True, remove_unreferenced=True)
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
with OUTPUT.open('wb') as file:writer.write(file)
print(f'Updated {OUTPUT.name}: {len(writer.pages)} pages')
for i,(title,group,_) in enumerate(chapters):print(f'{i+FIRST_CHAPTER_INDEX+1:02d} {title}')
