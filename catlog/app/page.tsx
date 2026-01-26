import Link from "next/link";
import {
  Utensils,
  Droplets,
  Database,
  BarChart3,
  ChevronRight,
  Scale,
} from "lucide-react";

const cards = [
  {
    href: "/entry/meal",
    title: "給餌入力",
    desc: "食べた量(g) / kcal を記録・修正",
    icon: Utensils,
  },
  {
    href: "/entry/elim",
    title: "排泄入力",
    desc: "うんち・おしっこ の記録",
    icon: Droplets,
  },
  {
    href: "/entry/weight",
    title: "体重入力",
    desc: "体重(kg)を記録",
    icon: Scale,
  },
  {
    href: "/foods",
    title: "フード管理",
    desc: "フードDBの追加・編集・削除",
    icon: Database,
  },
  {
    href: "/summary",
    title: "集計",
    desc: "日別・ルール集計・グラフ",
    icon: BarChart3,
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">猫ログ</h1>
        <p className="text-sm text-zinc-600">
          (C)2026 N.Yokoyama
        </p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.href}
              href={c.href}
              className="group rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-2xl border bg-zinc-50 p-3">
                  <Icon size={22} />
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-base font-semibold">{c.title}</div>
                    <ChevronRight
                      className="ml-auto opacity-40 transition group-hover:translate-x-0.5"
                      size={18}
                    />
                  </div>
                  <div className="mt-1 text-sm text-zinc-600">{c.desc}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold">コツ</div>
        <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
          <li>入力を間違えたら「全一覧」or「直近ログ」から修正できます</li>
          <li>スマホは下部タブから片手で移動できます</li>
          <li>体重は週1〜でもOK。7日移動平均で長期の変化が見やすくなります</li>
        </ul>
      </div>
    </main>
  );
}
