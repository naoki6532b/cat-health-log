"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");

    if (password.length < 6) {
      setMsg("パスワードは6文字以上にしてください");
      return;
    }
    if (password !== password2) {
      setMsg("パスワード(確認)が一致しません");
      return;
    }

    setBusy(true);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      setMsg(`登録に失敗しました: ${error.message}`);
      setBusy(false);
      return;
    }

    // メール確認が有効な場合はセッションが返らない
    if (!data.session) {
      setDone(true);
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
            アカウント新規登録
          </h1>
        </div>

        {done ? (
          <div className="flex flex-col gap-4 text-sm">
            <p>
              確認メールを送信しました。メール内のリンクを開いて登録を完了してから、
              ログインしてください。
            </p>
            <Link
              href="/login"
              className="rounded-xl bg-emerald-600 px-4 py-2 text-center font-semibold text-white"
            >
              ログインへ
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted">
              家族で共有する場合は、1つのアカウントを作って
              メールアドレスとパスワードを家族内で共有してください。
            </p>

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
                パスワード(6文字以上)
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-xl border border-line px-3 py-2"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                パスワード(確認)
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  className="rounded-xl border border-line px-3 py-2"
                />
              </label>

              {msg && <p className="text-sm text-red-600">{msg}</p>}

              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
              >
                {busy ? "登録中…" : "登録する"}
              </button>
            </form>

            <p className="mt-4 text-center text-sm text-muted">
              すでにアカウントがある場合は{" "}
              <Link href="/login" className="text-emerald-700 underline">
                ログイン
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
