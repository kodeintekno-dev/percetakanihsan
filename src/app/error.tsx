"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone" role="alert">
      <h1>Halaman belum dapat dimuat</h1>
      <p>Periksa koneksi dan konfigurasi database. Data Anda tidak diubah.</p>
      <button onClick={reset}>Coba lagi</button>
    </main>
  );
}
