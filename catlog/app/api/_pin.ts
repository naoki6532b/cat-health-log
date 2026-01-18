import { NextResponse } from "next/server";

/**
 * PIN が正しければ null を返す
 * PIN が違えば 403 Response を返す
 *
 * 重要:
 * - Vercel側で CATLOG_PIN と NEXT_PUBLIC_CATLOG_PIN がズレる事故が起きやすいので
 *   「どっちかに一致したらOK」にしておく。
 */
export function checkPin(req: Request) {
  const candidates = [
    process.env.CATLOG_PIN ?? "",
    process.env.NEXT_PUBLIC_CATLOG_PIN ?? "",
  ].filter(Boolean);

  // PIN 未設定ならチェックしない（開発用）
  if (candidates.length === 0) return null;

  const got = req.headers.get("x-catlog-pin") ?? "";
  if (candidates.includes(got)) return null;

  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}
