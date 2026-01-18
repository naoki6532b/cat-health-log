import "./globals.css";
import Link from "next/link";
import {
  Home,
  Utensils,
  Droplets,
  ListChecks,
  Database,
  BarChart3,
  Scale,
} from "lucide-react";

export const metadata = {
  title: "猫健康ログ",
  description: "Cat Health Log",
};

const nav = [
  { href: "/", label: "トップ", icon: Home },
  { href: "/entry/meal", label: "給餌", icon: Utensils },
  { href: "/entry/elim", label: "排泄", icon: Droplets },
  { href: "/elims", label: "排泄一覧", icon: ListChecks },
  { href: "/foods", label: "フード", icon: Database },
  { href: "/summary", label: "集計", icon: BarChart3 },

  // ✅ 追加：体重（入力）と体重一覧
  { href: "/entry/weight", label: "体重", icon: Scale },
  { href: "/weights", label: "体重一覧", icon: ListChecks },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className="navbtn">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6 pb-28">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/65 sm:hidden">
          <div className="mx-auto max-w-5xl px-3 py-2">
            {/* ✅ 7 → 8 に変更 */}
            <div className="grid grid-cols-8 gap-2">
              {nav.map((n) => {
                const Icon = n.icon;
                return (
                  <Link key={n.href} href={n.href} className="bottombtn">
                    <Icon size={18} />
                    {n.label}
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
