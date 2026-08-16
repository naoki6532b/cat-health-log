"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { DEFAULT_DAILY_KCAL_WARNING_THRESHOLD } from "@/lib/calorieWarning";
import {
  DEFAULT_STOOL_WARNING_DAYS,
  DEFAULT_URINE_WARNING_DAYS,
  DEFAULT_WEIGHT_WARNING_DAYS,
} from "@/lib/healthRecordWarning";

type CatProfile = {
  id: number;
  cat_name: string | null;
  birthday: string | null;
  photo_path: string | null;
  daily_kcal_warning_threshold: number;
  weight_warning_days: number;
  stool_warning_days: number;
  urine_warning_days: number;
  created_at: string | null;
  updated_at: string | null;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const PROFILE_BUCKET = process.env.NEXT_PUBLIC_CATLOG_PROFILE_BUCKET || "cat-profile-images";

function photoUrl(path: string | null) {
  if (!path || !SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${PROFILE_BUCKET}/${path}`;
}

function drawCroppedPhoto(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  zoom: number,
  positionX: number,
  positionY: number
) {
  const context = canvas.getContext("2d");
  if (!context) return;

  const targetAspect = canvas.width / canvas.height;
  const sourceAspect = image.naturalWidth / image.naturalHeight;
  let baseWidth: number;
  let baseHeight: number;

  if (sourceAspect > targetAspect) {
    baseHeight = image.naturalHeight;
    baseWidth = baseHeight * targetAspect;
  } else {
    baseWidth = image.naturalWidth;
    baseHeight = baseWidth / targetAspect;
  }

  const cropWidth = baseWidth / zoom;
  const cropHeight = baseHeight / zoom;
  const sourceX =
    (image.naturalWidth - cropWidth) *
    (Math.min(100, Math.max(0, positionX)) / 100);
  const sourceY =
    (image.naturalHeight - cropHeight) *
    (Math.min(100, Math.max(0, positionY)) / 100);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );
}

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("画像の切り出しに失敗しました"));
      },
      "image/jpeg",
      0.9
    );
  });
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
  const [dailyKcalWarningThreshold, setDailyKcalWarningThreshold] = useState(
    String(DEFAULT_DAILY_KCAL_WARNING_THRESHOLD)
  );
  const [weightWarningDays, setWeightWarningDays] = useState(
    String(DEFAULT_WEIGHT_WARNING_DAYS)
  );
  const [stoolWarningDays, setStoolWarningDays] = useState(
    String(DEFAULT_STOOL_WARNING_DAYS)
  );
  const [urineWarningDays, setUrineWarningDays] = useState(
    String(DEFAULT_URINE_WARNING_DAYS)
  );
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropImageRef = useRef<HTMLImageElement | null>(null);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const [cropFileName, setCropFileName] = useState("cat-profile");
  const [cropZoom, setCropZoom] = useState(1);
  const [cropPositionX, setCropPositionX] = useState(50);
  const [cropPositionY, setCropPositionY] = useState(50);

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
        daily_kcal_warning_threshold: DEFAULT_DAILY_KCAL_WARNING_THRESHOLD,
        weight_warning_days: DEFAULT_WEIGHT_WARNING_DAYS,
        stool_warning_days: DEFAULT_STOOL_WARNING_DAYS,
        urine_warning_days: DEFAULT_URINE_WARNING_DAYS,
        created_at: null,
        updated_at: null,
      };

    setProfile(next);
    setCatName(next.cat_name ?? "");
    setBirthday(next.birthday ?? "");
    setDailyKcalWarningThreshold(
      String(
        next.daily_kcal_warning_threshold ??
          DEFAULT_DAILY_KCAL_WARNING_THRESHOLD
      )
    );
    setWeightWarningDays(
      String(next.weight_warning_days ?? DEFAULT_WEIGHT_WARNING_DAYS)
    );
    setStoolWarningDays(
      String(next.stool_warning_days ?? DEFAULT_STOOL_WARNING_DAYS)
    );
    setUrineWarningDays(
      String(next.urine_warning_days ?? DEFAULT_URINE_WARNING_DAYS)
    );
  }

  useEffect(() => {
    void load().catch((e) => setMsg(`ERROR: ${String(e?.message ?? e)}`));
  }, []);

  useEffect(() => {
    if (!cropSourceUrl) {
      cropImageRef.current = null;
      return;
    }

    const image = new Image();
    image.onload = () => {
      cropImageRef.current = image;
      if (cropCanvasRef.current) {
        drawCroppedPhoto(cropCanvasRef.current, image, 1, 50, 50);
      }
    };
    image.onerror = () => setMsg("ERROR: 画像を読み込めませんでした");
    image.src = cropSourceUrl;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      URL.revokeObjectURL(cropSourceUrl);
    };
  }, [cropSourceUrl]);

  useEffect(() => {
    if (!cropCanvasRef.current || !cropImageRef.current) return;
    drawCroppedPhoto(
      cropCanvasRef.current,
      cropImageRef.current,
      cropZoom,
      cropPositionX,
      cropPositionY
    );
  }, [cropZoom, cropPositionX, cropPositionY]);

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
          daily_kcal_warning_threshold: Number(dailyKcalWarningThreshold),
          weight_warning_days: Number(weightWarningDays),
          stool_warning_days: Number(stoolWarningDays),
          urine_warning_days: Number(urineWarningDays),
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
      return true;
    } catch (e: any) {
      setMsg(`ERROR: ${String(e?.message ?? e)}`);
      return false;
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function openCropEditor(file: File) {
    if (!file.type.startsWith("image/")) {
      setMsg("ERROR: 画像ファイルを選択してください");
      return;
    }

    setMsg("");
    setCropFileName(file.name.replace(/\.[^.]+$/, "") || "cat-profile");
    setCropZoom(1);
    setCropPositionX(50);
    setCropPositionY(50);
    setCropSourceUrl(URL.createObjectURL(file));
  }

  function closeCropEditor() {
    setCropSourceUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function saveCroppedPhoto() {
    const image = cropImageRef.current;
    if (!image) {
      setMsg("ERROR: 画像の読み込みが完了していません");
      return;
    }

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = 800;
    outputCanvas.height = 1000;
    drawCroppedPhoto(
      outputCanvas,
      image,
      cropZoom,
      cropPositionX,
      cropPositionY
    );

    try {
      const blob = await canvasToJpeg(outputCanvas);
      const croppedFile = new File([blob], `${cropFileName}.jpg`, {
        type: "image/jpeg",
      });
      const saved = await uploadPhoto(croppedFile);
      if (saved) closeCropEditor();
    } catch (e: unknown) {
      setMsg(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
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
              <img src={currentPhotoUrl} alt="猫プロフィール写真" className="aspect-[4/5] w-full object-cover" />
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center text-sm text-zinc-500">
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
                  if (file) openCropEditor(file);
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

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-sm">
                <div className="mb-1 font-medium text-zinc-700">
                  体重計測警告日数
                </div>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={weightWarningDays}
                  onChange={(e) => setWeightWarningDays(e.target.value)}
                  className="input"
                />
                <div className="mt-1 text-xs text-zinc-500">
                  過去n日間に体重記録がない場合に警告します。
                </div>
              </label>

              <label className="block text-sm">
                <div className="mb-1 font-medium text-zinc-700">
                  うんち警告日数
                </div>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={stoolWarningDays}
                  onChange={(e) => setStoolWarningDays(e.target.value)}
                  className="input"
                />
                <div className="mt-1 text-xs text-zinc-500">
                  n日を超えて記録がない場合に警告します。
                </div>
              </label>

              <label className="block text-sm">
                <div className="mb-1 font-medium text-zinc-700">
                  おしっこ警告日数
                </div>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={urineWarningDays}
                  onChange={(e) => setUrineWarningDays(e.target.value)}
                  className="input"
                />
                <div className="mt-1 text-xs text-zinc-500">
                  n日を超えて記録がない場合に警告します。
                </div>
              </label>
            </div>

            <label className="block text-sm">
              <div className="mb-1 font-medium text-zinc-700">
                警告基準カロリー（kcal／日）
              </div>
              <input
                type="number"
                min="1"
                step="1"
                value={dailyKcalWarningThreshold}
                onChange={(e) => setDailyKcalWarningThreshold(e.target.value)}
                className="input"
              />
              <div className="mt-1 text-xs text-zinc-500">
                今日を除く直近7日の日別実食カロリーがこの値以下の場合に警告します。
              </div>
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
                <li>警告基準カロリーの初期値は240 kcal／日です。</li>
                <li>体重計測警告日数の初期値は10日です。</li>
                <li>うんち・おしっこ警告日数の初期値は各2日です。</li>
                <li>写真は jpg / png / webp、5MB 以下です。</li>
                <li>ヘッダーからはどの画面でもトップへ戻れますが、トップ画面自身にはトップボタンは出しません。</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {cropSourceUrl ? (
        <div
          className="fixed inset-0 z-[9999] overflow-y-auto bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="photo-crop-title"
        >
          <div className="mx-auto my-4 w-full max-w-2xl rounded-3xl bg-white p-4 shadow-xl sm:p-6">
            <div>
              <h2 id="photo-crop-title" className="text-lg font-semibold">
                写真の表示範囲を調整
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                枠内に見えている範囲がトップ画面の写真として保存されます。
              </p>
            </div>

            <div className="mt-4 grid items-start gap-5 sm:grid-cols-[320px_minmax(0,1fr)]">
              <div className="mx-auto overflow-hidden rounded-2xl border bg-zinc-100 shadow-inner">
                <canvas
                  ref={cropCanvasRef}
                  width={320}
                  height={400}
                  className="block h-auto w-full max-w-[320px]"
                />
              </div>

              <div className="space-y-4">
                <label className="block text-sm">
                  <div className="flex items-center justify-between gap-3 font-medium text-zinc-700">
                    <span>拡大率</span>
                    <span>{cropZoom.toFixed(1)}倍</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.1"
                    value={cropZoom}
                    onChange={(e) => setCropZoom(Number(e.target.value))}
                    className="mt-2 w-full"
                  />
                </label>

                <label className="block text-sm">
                  <div className="font-medium text-zinc-700">左右位置</div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={cropPositionX}
                    onChange={(e) => setCropPositionX(Number(e.target.value))}
                    className="mt-2 w-full"
                  />
                </label>

                <label className="block text-sm">
                  <div className="font-medium text-zinc-700">上下位置</div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={cropPositionY}
                    onChange={(e) => setCropPositionY(Number(e.target.value))}
                    className="mt-2 w-full"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setCropZoom(1);
                    setCropPositionX(50);
                    setCropPositionY(50);
                  }}
                  className="w-full rounded-2xl border bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50"
                >
                  調整をリセット
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeCropEditor}
                disabled={uploading}
                className="rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void saveCroppedPhoto()}
                disabled={uploading}
                className="rounded-2xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {uploading ? "保存中..." : "この範囲で写真を保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
