import "./globals.css";
import Link from "next/link";
import { appNav } from "@/lib/appNav";

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
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-line bg-head/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-xl">🐱</span>
              <span className="font-semibold tracking-tight">猫健康ログ</span>
              <span className="ml-2 hidden rounded-full border border-line bg-white/70 px-2 py-0.5 text-xs text-muted sm:inline">
                Cat Health Log
              </span>
            </Link>

            {/* PC Nav */}
            <nav className="ml-auto hidden flex-wrap items-center gap-2 sm:flex">
              {appNav.map((item) => (
                <Link key={item.href} href={item.href} className="navbtn">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6 pb-28">{children}</main>

        {/* Mobile bottom nav */}
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