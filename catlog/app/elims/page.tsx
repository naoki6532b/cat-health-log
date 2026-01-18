"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type Daily = { day: string; poop: number; pee: number };

function cls(...a: Array<string | false | undefined>) {
  return a.filter(Boolean).join(" ");
}

export default function ElimsPage() {
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [rows, setRows] = useState<Daily[]>([]);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setMsg("");

    // ★ここが重要： /elims/daily ではなく /api/elims/daily
    const res = await apiFetch(`/api/elims/daily?days=${days}`);

    // 失敗したら本文(text)を出す（HTML 404 が返ってきても原因が分かる）
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t);
    }

    const data = ((await res.json()) as Daily[]) ?? [];

    // ✅ 追加：うんちもおしっこも 0 の日は表示しない
    const filtered = data.filter((r) => (r.poop ?? 0) > 0 || (r.pee ?? 0) > 0);

    setRows(filtered);
  };

  useEffect(() => {
    load().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const totals = useMemo(() => {
    let poop = 0;
    let pee = 0;
    for (const r of rows) {
      poop += r.poop ?? 0;
      pee += r.pee ?? 0;
    }
    return { poop, pee };
  }, [rows]);

  return (
    <main className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            排泄 日別回数（うんち/おしっこ）
          </h1>
          <div className="mt-1 text-sm text-zinc-600">
            合計：うんち {totals.poop} 回 / おしっこ {totals.pee} 回（{days}日）
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/entry/elim" className="navbtn">
            排泄入力へ
          </Link>

          {/* ★追加：修正/削除できるログ画面 */}
          <Link href="/elims/logs" className="navbtn">
            ログ編集
          </Link>

          <button
            onClick={() =>
              load().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)))
            }
            className="navbtn"
          >
            更新
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d as 7 | 14 | 30)}
            className={cls(
              "rounded-2xl border px-4 py-2 text-sm font-semibold shadow-sm transition",
              days === d
                ? "bg-zinc-900 text-white"
                : "bg-white hover:bg-zinc-50"
            )}
          >
            {d}日
          </button>
        ))}
      </div>

      {msg && (
        <div
          className={cls(
            "text-sm whitespace-pre-wrap break-words",
            msg.startsWith("ERROR") ? "text-red-600" : "text-emerald-700"
          )}
        >
          {msg}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="grid grid-cols-3 border-b bg-zinc-50 px-4 py-3 text-xs font-semibold text-zinc-600">
          <div>日付</div>
          <div className="text-center">うんち</div>
          <div className="text-center">おしっこ</div>
        </div>

        <div className="divide-y">
          {rows.map((r) => (
            <div key={r.day} className="grid grid-cols-3 items-center px-4 py-3">
              <div className="text-sm font-semibold">{r.day}</div>

              <div className="flex justify-center">
                <span
                  className={cls(
                    "min-w-10 rounded-full px-3 py-1 text-center text-sm font-semibold",
                    r.poop > 0
                      ? "bg-amber-100 text-amber-900"
                      : "bg-zinc-100 text-zinc-500"
                  )}
                >
                  {r.poop}
                </span>
              </div>

              <div className="flex justify-center">
                <span
                  className={cls(
                    "min-w-10 rounded-full px-3 py-1 text-center text-sm font-semibold",
                    r.pee > 0
                      ? "bg-sky-100 text-sky-900"
                      : "bg-zinc-100 text-zinc-500"
                  )}
                >
                  {r.pee}
                </span>
              </div>
            </div>
          ))}

          {rows.length === 0 && (
            <div className="px-4 py-6 text-sm text-zinc-600">
              データがありません
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
