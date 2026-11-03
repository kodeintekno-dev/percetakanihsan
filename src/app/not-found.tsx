import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone">
      <h1>Halaman tidak ditemukan</h1>
      <p>Alamat yang Anda buka belum tersedia.</p>
      <Link className="button" href="/dashboard">
        Kembali ke dashboard
      </Link>
    </main>
  );
}
