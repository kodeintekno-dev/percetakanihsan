import { currentAdmin } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/login-form";
import { Printer, LockKeyhole } from "lucide-react";
export default async function LoginPage() {
  if (await currentAdmin()) redirect("/dashboard");
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand light">
          <span className="brand-icon">
            <Printer size={25} />
          </span>
          <span>
            CV Ihsan Mandiri<small>RUANG KERJA PERCETAKAN</small>
          </span>
        </div>
        <div>
          <span className="eyebrow">TERATUR, DARI LANGKAH PERTAMA</span>
          <h1>
            Ruang kerja untuk
            <br />
            setiap hasil cetak.
          </h1>
          <p>
            Kelola kebutuhan percetakan Anda dalam satu tempat yang sederhana
            dan mudah dipahami.
          </p>
          <div className="paper-art" aria-hidden="true">
            <i />
            <i />
            <i />
            <span>
              ihsan
              <br />
              <b>mandiri.</b>
            </span>
          </div>
        </div>
        <small>CV Ihsan Mandiri · Sistem internal perusahaan</small>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="icon-tile">
            <LockKeyhole size={24} />
          </div>
          <span className="eyebrow">AKSES ADMINISTRATOR</span>
          <h2>Selamat datang kembali</h2>
          <p className="muted">Masuk untuk membuka ruang kerja Anda.</p>
          <LoginForm />
          <p className="login-help">
            Belum memiliki akses? Hubungi pengelola aplikasi untuk menyiapkan
            akun admin.
          </p>
        </div>
      </section>
    </main>
  );
}
