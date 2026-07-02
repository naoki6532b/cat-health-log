"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "@/lib/api";

type Cat = {
  id: number;
  name: string;
  birthday: string | null;
  photo_path: string | null;
};

type CatsResponse = {
  data: Cat[];
  selected_id: number | null;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const PROFILE_BUCKET =
  process.env.NEXT_PUBLIC_CATLOG_PROFILE_BUCKET || "cat-profile-images";

function photoUrl(path: string | null) {
  if (!path || !SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${PROFILE_BUCKET}/${path}`;
}

export default function CatsPage() {
  const router = useRouter();
  const [cats, setCats] = useState<Cat[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const json = await apiJson<CatsResponse>("/api/cats");
    setCats(json.data);
    setSelectedId(json.selected_id);
  }

  useEffect(() => {
    load().catch((e) => setMsg(String(e?.message ?? e)));
  }, []);

  async function select(catId: number) {
    setBusy(true);
    setMsg("");
    try {
      await apiJson("/api/cats/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cat_id: catId }),
      });
      router.push("/");
      router.refresh();
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
      setBusy(false);
    }
  }

  async function createCat(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setMsg("猫の名前を入力してください");
      return;
    }

    setBusy(true);
    setMsg("");
    try {
      const json = await apiJson<{ data: Cat }>("/api/cats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          birthday: birthday || null,
        }),
      });
      // 登録した猫をそのまま選択して開始
      await select(json.data.id);
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold tracking-tight">猫を選ぶ</h1>

      {cats === null ? (
        <p className="mt-6 text-sm text-muted">読み込み中…</p>
      ) : cats.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          まだ猫が登録されていません。下のフォームから最初の猫を登録してください。
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {cats.map((cat) => {
            const url = photoUrl(cat.photo_path);
            return (
              <li key={cat.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => select(cat.id)}
                  className="flex w-full items-center gap-4 rounded-2xl border border-line bg-white p-4 text-left shadow-sm hover:bg-emerald-50 disabled:opacity-50"
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={cat.name}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-2xl">
                      🐱
                    </span>
                  )}
                  <span className="flex-1">
                    <span className="block font-semibold">{cat.name}</span>
                    {cat.birthday && (
                      <span className="block text-xs text-muted">
                        誕生日: {cat.birthday}
                      </span>
                    )}
                  </span>
                  {selectedId === cat.id && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      選択中
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <section className="mt-8 rounded-2xl border border-line bg-white p-4 shadow-sm">
        <h2 className="font-semibold">新しい猫を登録</h2>
        <form onSubmit={createCat} className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            名前(必須)
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl border border-line px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            誕生日
            <input
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              className="rounded-xl border border-line px-3 py-2"
            />
          </label>

          {msg && <p className="text-sm text-red-600">{msg}</p>}

          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            登録してこの猫で始める
          </button>
        </form>
      </section>
    </div>
  );
}
