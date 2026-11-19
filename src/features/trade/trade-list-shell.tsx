"use client";

import { useOptimistic, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import type { TradeKind } from "./schema";
import { TradeListLoading } from "./trade-list-loading";

export function TradeListShell({
  kind,
  kinds,
  children,
}: {
  kind: TradeKind;
  kinds: Record<TradeKind, string>;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeKind, setActiveKind] = useOptimistic(kind);

  return (
    <div className="trade-page">
      <PageHeading
        eyebrow="KEUANGAN USAHA"
        title="Hutang-Piutang"
        description="Pantau tagihan pelanggan dan kewajiban ke pemasok. Pembayaran terhubung langsung ke Buku Kas."
      />
      <nav className="trade-tabs" aria-label="Jenis tagihan">
        {Object.entries(kinds).map(([key, title]) => {
          const target = key as TradeKind;
          const href = `/hutang-piutang?kind=${target}`;
          return (
            <Link
              key={key}
              href={href}
              scroll={false}
              aria-current={activeKind === target ? "page" : undefined}
              onNavigate={(event) => {
                event.preventDefault();
                startTransition(() => {
                  setActiveKind(target);
                  router.push(href, { scroll: false });
                });
              }}
            >
              {title}
            </Link>
          );
        })}
      </nav>
      <div aria-busy={pending}>
        {pending ? <TradeListLoading kind={activeKind} /> : children}
      </div>
    </div>
  );
}
