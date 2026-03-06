import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { appNav } from "@/lib/appNav";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">猫ログ</h1>
        <p className="text-sm text-zinc-600">(C)2026 N.Yokoyama</p>
      </div>

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