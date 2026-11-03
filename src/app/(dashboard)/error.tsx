"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="panel empty-state" role="alert">
      <h1>Data belum dapat dimuat</h1>
      <p>
        Periksa koneksi database dan pastikan migrasi sudah diterapkan. Hubungi
        pengelola jika kendala berlanjut.
      </p>
      <button onClick={reset}>Coba muat ulang</button>
    </section>
  );
}
