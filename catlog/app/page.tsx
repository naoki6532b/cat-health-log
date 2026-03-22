import Link from "next/link";
import { ChevronRight, Cake, CalendarHeart, PencilLine } from "lucide-react";
import { appNav } from "@/lib/appNav";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const PROFILE_ID = 1;
const PROFILE_BUCKET =
  process.env.CATLOG_PROFILE_BUCKET ||
  process.env.NEXT_PUBLIC_CATLOG_PROFILE_BUCKET ||
  "cat-profile-images";

type CatProfile = {
  cat_name: string | null;
  birthday: string | null;
  photo_path: string | null;
};

function formatBirthday(dateStr: string | null) {
  if (!dateStr) return "未設定";
  const d = new Date(`${dateStr}T00:00:00`);
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function calcAgeJp(dateStr: string | null) {
  if (!dateStr) return "未設定";

  const birth = new Date(`${dateStr}T00:00:00`);
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

  if (years < 0) return "未設定";
  return `${years}歳${months}か月`;
}

async function loadProfile(): Promise<{ catName: string; birthday: string | null; photoUrl: string | null }> {
  try {
    const supabase = getSupabaseAdmin() as any;
    const { data, error } = await supabase
      .from("cat_profile")
      .select("cat_name, birthday, photo_path")
      .eq("id", PROFILE_ID)
      .maybeSingle();

    if (error) {
      return { catName: "愛猫", birthday: null, photoUrl: null };
    }

    const profile = (data ?? null) as CatProfile | null;
    const catName = profile?.cat_name?.trim() || "愛猫";
    const birthday = profile?.birthday ?? null;

    let photoUrl: string | null = null;
    if (profile?.photo_path) {
      const result = supabase.storage.from(PROFILE_BUCKET).getPublicUrl(profile.photo_path);
      photoUrl = result?.data?.publicUrl ?? null;
    }

    return { catName, birthday, photoUrl };
  } catch {
    return { catName: "愛猫", birthday: null, photoUrl: null };
  }
}

export default async function HomePage() {
  const profile = await loadProfile();
  const ageLabel = calcAgeJp(profile.birthday);
  const birthdayLabel = formatBirthday(profile.birthday);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">猫ログ</h1>
        <p className="text-sm text-zinc-600">(C)2026 N.Yokoyama</p>
      </div>

      <section className="mt-6 overflow-hidden rounded-3xl border bg-white shadow-sm">
        <div className="grid gap-0 md:grid-cols-[260px_minmax(0,1fr)]">
          <div className="bg-zinc-50">
            {profile.photoUrl ? (
              <img
                src={profile.photoUrl}
                alt={`${profile.catName}の写真`}
                className="h-full min-h-[260px] w-full object-cover"
              />
            ) : (
              <div className="flex min-h-[260px] items-center justify-center text-sm text-zinc-500">
                写真未設定
              </div>
            )}
          </div>

          <div className="flex flex-col justify-center p-6">
            <div className="inline-flex w-fit items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              My Cat Profile
            </div>

            <h2 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900">
              {profile.catName}
            </h2>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
                  <Cake size={16} />
                  誕生日
                </div>
                <div className="mt-2 text-lg font-semibold text-zinc-900">{birthdayLabel}</div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
                  <CalendarHeart size={16} />
                  年齢
                </div>
                <div className="mt-2 text-lg font-semibold text-zinc-900">{ageLabel}</div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/profile" className="navbtn inline-flex items-center gap-2">
                <PencilLine size={16} />
                プロフィール設定
              </Link>
            </div>

            <p className="mt-5 text-sm leading-6 text-zinc-600">
              誕生日から今日時点の年齢を自動計算して表示しています。
            </p>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {appNav.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-2xl border bg-zinc-50 p-3">
                  <Icon size={22} />
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-base font-semibold">{item.label}</div>
                    <ChevronRight
                      className="ml-auto opacity-40 transition group-hover:translate-x-0.5"
                      size={18}
                    />
                  </div>
                  <div className="mt-1 text-sm text-zinc-600">{item.desc}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold">コツ</div>
        <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
          <li>入力を間違えたら一覧画面から確認・修正できます</li>
          <li>給餌は単品入力とセット入力の両方が使えます</li>
          <li>体重は週1〜でもOK。7日移動平均で長期の変化が見やすくなります</li>
        </ul>
      </div>
    </main>
  );
}