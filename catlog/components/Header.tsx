"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { appNav } from "@/lib/appNav";
import { supabase } from "@/lib/supabaseClient";

function cls(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === "/";
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="site-header sticky top-0 z-50 border-b border-line bg-head/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center">
        {isHome ? (
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-xl">🐱</span>
            <span className="whitespace-nowrap font-semibold tracking-tight">猫健康ログ</span>
            <span className="hidden whitespace-nowrap rounded-lg border border-line bg-white/70 px-3 py-1.5 text-xs text-muted sm:inline-flex">
              Cat Health Log
            </span>
          </div>
        ) : (
          <Link href="/" className="flex shrink-0 items-center gap-3">
            <span className="text-xl">🐱</span>
            <span className="whitespace-nowrap font-semibold tracking-tight">猫健康ログ</span>
            <span className="hidden whitespace-nowrap rounded-lg border border-line bg-white/70 px-3 py-1.5 text-xs text-muted sm:inline-flex">
              Cat Health Log
            </span>
          </Link>
        )}

        {!isAuthPage && (
          <nav className="flex min-w-0 flex-1 flex-col gap-2 lg:items-end">
            <div className="hidden flex-wrap items-center gap-2 sm:flex lg:justify-end">
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
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Link href="/cats" className="navbtn" title="猫の切り替え">
                🐾 猫切替
              </Link>
              <button
                type="button"
                onClick={logout}
                className="navbtn"
                title="ログアウト"
              >
                ログアウト
              </button>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
