import { requirePageAdmin } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";
export const dynamic = "force-dynamic";
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requirePageAdmin();
  return <AppShell email={admin.email}>{children}</AppShell>;
}
