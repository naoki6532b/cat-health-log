"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type Daily = { day: string; poop: number; pee: number };

type ElimRow = {
  id: number;
  dt: string;
  stool: string | null;
  urine: string | null;
  urine_ml: number | null;
  amount: number | null;
  note: string | null;
  vomit: boolean;
  kind: string;
  score: number | null;
};

function cls(...a: Array<string | false | undefined>) {
  return a.filter(Boolean).join(" ");
}

function ymdJst(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));

  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

function fmtTimeJst(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function kindLabel(row: ElimRow) {
  const kind = String(row.kind ?? "").trim();
  if (kind === "both") return "両方";
  if (kind === "stool") return "うんち";
  if (kind === "urine") return "おしっこ";
  if (row.stool && row.urine) return "両方";
  if (row.stool) return "うんち";
  if (row.urine) return "おしっこ";
  return "未設定";
}

export default function ElimsPage() {
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [rows, setRows] = useState<Daily[]>([]);
  const [detailMap, setDetailMap] = useState<Record<string, ElimRow[]>>({});
  const [msg, setMsg] = useState("");
  const [openDay, setOpenDay] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    setMsg("");

    const [dailyRes, detailRes] = await Promise.all([
      apiFetch(`/api/elims/daily?days=${days}`),
      apiFetch(`/api/elims?days=${days}`),
    ]);

    if (!dailyRes.ok) {
      const t = await dailyRes.text();
      throw new Error(t || `HTTP ${dailyRes.status}`);
    }

    if (!detailRes.ok) {
      const t = await detailRes.text();
      throw new Error(t || `HTTP ${detailRes.status}`);
    }

    const dailyData = ((await dailyRes.json()) as Daily[]) ?? [];
    const detailJson = (await detailRes.json()) as { data?: ElimRow[] };
    const detailRows = detailJson.data ?? [];

    const filtered = dailyData.filter((r) => (r.poop ?? 0) > 0 || (r.pee ?? 0) > 0);
    setRows(filtered);

    const nextMap: Record<string, ElimRow[]> = {};
    for (const row of detailRows) {
      const day = ymdJst(row.dt);
      if (!nextMap[day]) nextMap[day] = [];
      nextMap[day].push(row);
    }

    for (const day of Object.keys(nextMap)) {
      nextMap[day].sort((a, b) => new Date(a.dt).getTime() - new Date(b.dt).getTime());
    }

    setDetailMap(nextMap);
    setOpenDay((prev) => (prev && nextMap[prev] ? prev : null));
  };

  useEffect(() => {
    load().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)));
    setOpenDay(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(e.target as Node)) return;
      setOpenDay(null);
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

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
    <main className="space-y-5" ref={wrapRef}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            排泄 日別回数（うんち/おしっこ）
          </h1>
          <div className="mt-1 text-sm text-zinc-600">
            合計：うんち {totals.poop} 回 / おしっこ {totals.pee} 回（{days}日）
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            日付を押すと、その日の排泄明細を表示します。
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/entry/elim" className="navbtn">
            排泄入力へ
          </Link>
          <Link href="/elims/logs" className="navbtn">
            ログ編集
          </Link>
          <button
            type="button"
            onClick={() =>
              load().catch((e) => setMsg("ERROR: " + String(e?.message ?? e)))
            }
            className="btn"
          >
            更新
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d as 7 | 14 | 30)}
            className={cls(
              "rounded-2xl border px-4 py-2 text-sm font-semibold shadow-sm transition",
              days === d ? "bg-zinc-900 text-white" : "bg-white hover:bg-zinc-50"
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

      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="grid grid-cols-3 border-b bg-zinc-50 px-4 py-3 text-xs font-semibold text-zinc-600">
          <div>日付</div>
          <div className="text-center">うんち</div>
          <div className="text-center">おしっこ</div>
        </div>

        <div className="divide-y overflow-visible">
          {rows.map((r) => {
            const details = detailMap[r.day] ?? [];
            const isOpen = openDay === r.day;

            return (
              <div
                key={r.day}
                className="grid grid-cols-3 items-center px-4 py-3"
              >
                <div className="relative pr-3">
                  <button
                    type="button"
                    onClick={() => setOpenDay((prev) => (prev === r.day ? null : r.day))}
                    className={cls(
                      "rounded-lg px-2 py-1 text-left text-sm font-semibold transition hover:bg-zinc-100",
                      isOpen && "bg-zinc-100"
                    )}
                  >
                    {r.day}
                  </button>

                  {isOpen && (
                    <div className="absolute left-0 top-full z-30 mt-2 w-[330px] max-w-[calc(100vw-3rem)] rounded-2xl border bg-white p-3 shadow-xl">
                      <div className="absolute -top-2 left-6 h-3 w-3 rotate-45 border-l border-t bg-white" />

                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">{r.day} の排泄明細</div>
                          <div className="text-xs text-zinc-500">{details.length} 件</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setOpenDay(null)}
                          className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100"
                        >
                          閉じる
                        </button>
                      </div>

                      {details.length > 0 ? (
                        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                          {details.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-semibold">
                                  {fmtTimeJst(item.dt)}
                                </div>
                                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200">
                                  {kindLabel(item)}
                                </span>
                              </div>

                              <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-600">
                                {item.amount !== null && <span>量: {item.amount}</span>}
                                {item.urine_ml !== null && <span>尿量: {item.urine_ml}ml</span>}
                                {item.vomit && <span>嘔吐あり</span>}
                              </div>

                              {item.note && (
                                <div className="mt-1 text-xs leading-5 text-zinc-700">
                                  {item.note}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-zinc-500">明細はありません</div>
                      )}
                    </div>
                  )}
                </div>

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
            );
          })}

          {rows.length === 0 && (
            <div className="px-4 py-6 text-sm text-zinc-600">データがありません</div>
          )}
        </div>
      </div>
    </main>
  );
}