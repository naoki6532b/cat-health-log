import type { NextRequest } from "next/server";

const HEADER = "x-catlog-pin";

/**
 * 期待PINはサーバー側環境変数から読む（VercelのEnvironment Variables）
 * - CATLOG_PIN を推奨
 * 互換で NEXT_PUBLIC_CATLOG_PIN も許容（本当はサーバー専用が安全）
 */
function expectedPin(): string {
  return (
    process.env.CATLOG_PIN ??
    process.env.NEXT_PUBLIC_CATLOG_PIN ??
    ""
  ).trim();
}

/**
 * API保護：ヘッダ x-catlog-pin が一致していればOK
 * PIN未設定（空）の場合は開発を楽にするため “通す”
 */
export function checkPin(req: Request | NextRequest): boolean {
  const exp = expectedPin();
  if (!exp) return true;

  const got = (req.headers.get(HEADER) ?? "").trim();
  return got === exp;
}
