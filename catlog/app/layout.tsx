import "./globals.css";
import Link from "next/link";
import { Home, Utensils, Droplets, Database, BarChart3 } from "lucide-react";

export const metadata = {
  title: "猫健康ログ",
  description: "Cat Health Log",
};

const nav = [
  { href: "/", label: "トップ", icon: Home },
  { href: "/entry/meal", label: "給餌", icon: Utensils },
  { href: "/entry/elim", label: "排泄", icon: Droplets },
  { href: "/foods", label: "フード", icon: Database },
  { href: "/summary", label: "集計", icon: BarChart3 },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen text-zinc-900">
        {/* Top glass header */}
        <header className="sticky top-0 z-50 border-b bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/50">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-xl">🐱</span>
              <span className="font-semibold tracking-tight">猫健康ログ</span>
              <span className="ml-2 hidden rounded-full border bg-white/70 px-2 py-0.5 text-xs text-zinc-600 sm:inline">
                Cat Health Log
              </span>
            </Link>

            <nav className="ml-auto hidden items-center gap-1 sm:flex">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-2xl px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100/70"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6 pb-24">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70 sm:hidden">
          <div className="mx-auto grid max-w-5xl grid-cols-5 px-2 py-2">
            {nav.map((n) => {
              const Icon = n.icon;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className="flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] text-zinc-700 hover:bg-zinc-100/70"
                >
                  <Icon size={18} />
                  {n.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </body>
    </html>
  );
}
