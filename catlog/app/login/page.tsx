"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      console.error("Supabase login error:", {
        name: error.name,
        message: error.message,
        status: error.status,
        code: error.code,
      });

      const detail = [
        error.message,
        error.code ? `code: ${error.code}` : "",
        error.status ? `status: ${error.status}` : "",
      ]
        .filter(Boolean)
        .join(" / ");

      setMsg(`ログインに失敗しました: ${detail}`);
      setBusy(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="text-2xl">🐱</span>
          <h1 className="text-xl font-semibold tracking-tight">
            猫健康ログにログイン
          </h1>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            メールアドレス
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-line px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            パスワード
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border border-line px-3 py-2"
            />
          </label>

          {msg && <p className="text-sm text-red-600 break-words">{msg}</p>}

          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {busy ? "ログイン中…" : "ログイン"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          アカウントがない場合は{" "}
          <Link href="/signup" className="text-emerald-700 underline">
            新規登録
          </Link>
        </p>
      </div>
    </div>
  );
}
