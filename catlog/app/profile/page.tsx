"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type CatProfile = {
  id: number;
  cat_name: string | null;
  birthday: string | null;
  photo_path: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const PROFILE_BUCKET = process.env.NEXT_PUBLIC_CATLOG_PROFILE_BUCKET || "cat-profile-images";

function photoUrl(path: string | null) {
  if (!path || !SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${PROFILE_BUCKET}/${path}`;
}

function calcAgeLabel(birthday: string | null) {
  if (!birthday) return "—";

  const birth = new Date(`${birthday}T00:00:00`);
  const today = new Date();

  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();

  if (today.getDate() < birth.getDate()) {
    months -= 1;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years < 0) {
    return "—";
  }

  return `${years}歳${months}か月`;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<CatProfile | null>(null);
  const [catName, setCatName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    setMsg("");
    const res = await apiFetch("/api/cat-profile");
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }

    const json = (await res.json()) as { data?: CatProfile };
    const next =
      json.data ?? {
        id: 1,
        cat_name: null,
        birthday: null,
        photo_path: null,
        created_at: null,
        updated_at: null,
      };

    setProfile(next);
    setCatName(next.cat_name ?? "");
    setBirthday(next.birthday ?? "");
  }

  useEffect(() => {
    void load().catch((e) => setMsg(`ERROR: ${String(e?.message ?? e)}`));
  }, []);

  async function onSave() {
    setSaving(true);
    setMsg("");
    try {
      const res = await apiFetch("/api/cat-profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cat_name: catName,
          birthday: birthday || null,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const json = (await res.json()) as { data?: CatProfile };
      if (json.data) {
        setProfile(json.data);
      }
      setMsg("✅ プロフィールを保存しました");
      await load();
    } catch (e: any) {
      setMsg(`ERROR: ${String(e?.message ?? e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    setMsg("");
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await apiFetch("/api/cat-profile/photo", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      setMsg("✅ 写真を更新しました");
      await load();
    } catch (e: any) {
      setMsg(`ERROR: ${String(e?.message ?? e)}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deletePhoto() {
    if (!profile?.photo_path) return;
    if (!confirm("現在の写真を削除しますか？")) return;

    setMsg("");
    try {
      const res = await apiFetch("/api/cat-profile/photo", { method: "DELETE" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      setMsg("✅ 写真を削除しました");
      await load();
    } catch (e: any) {
      setMsg(`ERROR: ${String(e?.message ?? e)}`);
    }
  }

  const currentPhotoUrl = photoUrl(profile?.photo_path ?? null);

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">猫プロフィール設定</h1>
          <p className="mt-1 text-sm text-zinc-600">
            トップ画面に表示する猫の名前・誕生日・写真を保存します。
          </p>
        </div>

        <Link href="/" className="navbtn">
          トップへ戻る
        </Link>
      </div>

      {msg && (
        <div className={msg.startsWith("ERROR") ? "text-sm text-red-600" : "text-sm text-emerald-700"}>
          {msg}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="card overflow-hidden">
          <div className="bg-zinc-50">
            {currentPhotoUrl ? (
              <img src={currentPhotoUrl} alt="猫プロフィール写真" className="h-[320px] w-full object-cover" />
            ) : (
              <div className="flex h-[320px] items-center justify-center text-sm text-zinc-500">
                写真が未設定です
              </div>
            )}
          </div>

          <div className="space-y-3 p-4">
            <div>
              <div className="text-xs font-semibold text-zinc-500">現在の表示名</div>
              <div className="mt-1 text-lg font-semibold text-zinc-900">
                {profile?.cat_name || "未設定"}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-zinc-500">現在の誕生日</div>
              <div className="mt-1 text-sm text-zinc-900">{profile?.birthday || "未設定"}</div>
            </div>

            <div>
              <div className="text-xs font-semibold text-zinc-500">年齢</div>
              <div className="mt-1 text-sm text-zinc-900">{calcAgeLabel(profile?.birthday ?? null)}</div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="btn"
              >
                {uploading ? "アップロード中..." : currentPhotoUrl ? "写真を差し替え" : "写真を追加"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadPhoto(file);
                }}
              />

              <button
                type="button"
                onClick={() => void deletePhoto()}
                disabled={!currentPhotoUrl}
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                写真を削除
              </button>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="grid gap-4">
            <label className="block text-sm">
              <div className="mb-1 font-medium text-zinc-700">猫の名前</div>
              <input value={catName} onChange={(e) => setCatName(e.target.value)} className="input" />
            </label>

            <label className="block text-sm">
              <div className="mb-1 font-medium text-zinc-700">誕生日</div>
              <input
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                className="input"
              />
            </label>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-xs font-semibold text-zinc-500">トップ画面の年齢表示</div>
              <div className="mt-2 text-base font-semibold text-zinc-900">
                {calcAgeLabel(birthday || null)}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button type="button" onClick={() => void onSave()} disabled={saving} className="btn">
                {saving ? "保存中..." : "保存"}
              </button>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              <div className="font-semibold text-zinc-900">メモ</div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>トップ画面では年齢を自動計算して「n歳nか月」で表示します。</li>
                <li>写真は jpg / png / webp、5MB 以下です。</li>
                <li>ヘッダーからはどの画面でもトップへ戻れますが、トップ画面自身にはトップボタンは出しません。</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}