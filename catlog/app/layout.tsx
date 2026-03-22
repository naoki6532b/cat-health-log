import "./globals.css";
import Link from "next/link";
import { appNav } from "@/lib/appNav";
import Header from "@/components/Header";

export const metadata = {
  title: "猫健康ログ",
  description: "Cat Health Log",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-app text-app">
        <Header />

        <main className="mx-auto max-w-5xl px-4 py-6 pb-28">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/65 sm:hidden">
          <div className="mx-auto max-w-5xl px-3 py-2">
            <div className="grid grid-cols-5 gap-2">
              {appNav.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className="bottombtn">
                    <Icon size={18} />
                    {item.shortLabel ?? item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
      </body>
    </html>
  );
}