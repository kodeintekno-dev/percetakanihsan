import type { Metadata } from "next";
import "./globals.css";
import "@/features/orders/orders.css";
import "@/features/cash/cash.css";
import "@/features/budget/budget.css";
import "@/features/reports/reports.css";
export const metadata: Metadata = {
  title: { default: "CV Ihsan Mandiri", template: "%s · CV Ihsan Mandiri" },
  description: "Ruang kerja percetakan CV Ihsan Mandiri",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
