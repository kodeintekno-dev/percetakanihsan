"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
export function DashboardRefresh({ generatedAt }: { generatedAt: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible")
        startTransition(() => router.refresh());
    };
    const timer = setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("ihsan-data-changed")
        : null;
    if (channel) channel.onmessage = refresh;
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      channel?.close();
    };
  }, [router, startTransition]);
  return (
    <div className="dashboard-refresh">
      <span>
        Diperbarui{" "}
        {new Intl.DateTimeFormat("id-ID", {
          timeStyle: "medium",
          timeZone: "Asia/Jakarta",
        }).format(new Date(generatedAt))}{" "}
        WIB · Otomatis 15 detik
      </span>
      <button
        className="button secondary"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        <RefreshCw size={15} />
        {pending ? "Memperbarui…" : "Perbarui"}
      </button>
    </div>
  );
}
