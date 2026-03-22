"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { appNav } from "@/lib/appNav";

function cls(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function Header() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-head/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        {isHome ? (
          <div className="flex items-center gap-2">
            <span className="text-xl">🐱</span>
            <span className="font-semibold tracking-tight">猫健康ログ</span>
            <span className="ml-2 hidden rounded-full border border-line bg-white/70 px-2 py-0.5 text-xs text-muted sm:inline">
              Cat Health Log
            </span>
          </div>
        ) : (
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl">🐱</span>
            <span className="font-semibold tracking-tight">猫健康ログ</span>
            <span className="ml-2 hidden rounded-full border border-line bg-white/70 px-2 py-0.5 text-xs text-muted sm:inline">
              Cat Health Log
            </span>
          </Link>
        )}

        <nav className="ml-auto hidden flex-wrap items-center gap-2 sm:flex">
          {!isHome && (
            <Link href="/" className="navbtn">
              トップ
            </Link>
          )}

          {appNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cls("navbtn", pathname === item.href && "bg-white")}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}