"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import {
  Printer,
  LayoutDashboard,
  ClipboardList,
  Tags,
  Wallet,
  Shapes,
  Calculator,
  ChartNoAxesCombined,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronRight,
  Download,
} from "lucide-react";

const groups = [
  {
    label: "RUANG KERJA",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/permintaan", label: "Permintaan Cetak", icon: ClipboardList },
      { href: "/buku-kas", label: "Buku Kas", icon: Wallet },
      { href: "/budgeting", label: "Budgeting", icon: Calculator },
      { href: "/laporan", label: "Laporan", icon: ChartNoAxesCombined },
    ],
  },
  {
    label: "MASTER & PENGATURAN",
    items: [
      { href: "/kategori-produk", label: "Kategori Produk", icon: Tags },
      { href: "/pos-pengeluaran", label: "Pos Pengeluaran", icon: Shapes },
      { href: "/pengaturan", label: "Pengaturan Kas", icon: Settings },
    ],
  },
];
export function AppShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const drawer = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    drawer.current?.close();
  }, [pathname]);
  async function logout() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok && response.status !== 401) {
        setError("Belum berhasil keluar. Coba kembali.");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Koneksi terputus. Coba kembali.");
    } finally {
      setPending(false);
    }
  }
  function navigation() {
    return (
      <>
        <Link
          className="brand"
          href="/dashboard"
          onClick={() => drawer.current?.close()}
        >
          <span className="brand-icon">
            <Printer size={23} />
          </span>
          <span>
            Ihsan Mandiri<small>RUANG KERJA PERCETAKAN</small>
          </span>
        </Link>
        <nav aria-label="Navigasi utama">
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={
                    pathname === href || pathname.startsWith(`${href}/`)
                      ? "nav-link active"
                      : "nav-link"
                  }
                  aria-current={
                    pathname === href || pathname.startsWith(`${href}/`)
                      ? "page"
                      : undefined
                  }
                  onClick={() => drawer.current?.close()}
                >
                  <Icon size={19} />
                  <span>{label}</span>
                  {(pathname === href || pathname.startsWith(`${href}/`)) && (
                    <ChevronRight size={15} />
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="avatar">A</span>
          <div>
            <strong>Administrator</strong>
            <small title={email}>{email}</small>
          </div>
          <button
            className="icon-button"
            title="Keluar"
            aria-label="Keluar dari aplikasi"
            onClick={logout}
            disabled={pending}
          >
            <LogOut size={18} />
          </button>
        </div>
      </>
    );
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#konten">
        Langsung ke konten
      </a>
      <aside className="sidebar">{navigation()}</aside>
      <dialog ref={drawer} className="drawer">
        <button
          className="icon-button drawer-close"
          onClick={() => drawer.current?.close()}
          aria-label="Tutup navigasi"
        >
          <X />
        </button>
        {navigation()}
      </dialog>
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => drawer.current?.showModal()}
            aria-label="Buka navigasi"
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            <span className="breadcrumb-context">Ruang kerja</span>
            <ChevronRight size={14} />
            <strong>
              {groups
                .flatMap((g) => g.items)
                .find(
                  (i) =>
                    i.href === pathname || pathname.startsWith(`${i.href}/`),
                )?.label ?? "Halaman"}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className="company-name">
              CV Ihsan Mandiri
              <span className="status-dot" />
            </span>
            <a className="button secondary guide-download" href="/api/guide">
              <Download size={16} aria-hidden="true" />
              Unduh Panduan
            </a>
          </div>
        </header>
        <main id="konten" className="main-content">
          {error && (
            <div role="alert" className="alert error">
              {error}
            </div>
          )}
          {children}
        </main>
        <footer className="workspace-footer">
          CV Ihsan Mandiri <span>Dirancang untuk langkah usaha Anda.</span>
        </footer>
      </div>
    </div>
  );
}
