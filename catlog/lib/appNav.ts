import {
  Home,
  Utensils,
  Droplets,
  ListChecks,
  Database,
  BarChart3,
  Scale,
  Layers3,
} from "lucide-react";

export type AppNavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  desc: string;
  icon: typeof Home;
};

export const appNav: AppNavItem[] = [
  {
    href: "/",
    label: "トップ",
    shortLabel: "トップ",
    desc: "ホーム画面",
    icon: Home,
  },
  {
    href: "/entry/meal",
    label: "給餌入力",
    shortLabel: "給餌",
    desc: "食べた量(g) / kcal を記録・修正",
    icon: Utensils,
  },
  {
    href: "/entry/elim",
    label: "排泄入力",
    shortLabel: "排泄",
    desc: "うんち・おしっこ の記録",
    icon: Droplets,
  },
  {
    href: "/elims",
    label: "排泄一覧",
    shortLabel: "排泄一覧",
    desc: "排泄ログの一覧確認",
    icon: ListChecks,
  },
  {
    href: "/entry/weight",
    label: "体重入力",
    shortLabel: "体重",
    desc: "体重(kg)を記録",
    icon: Scale,
  },
  {
    href: "/weights",
    label: "体重一覧",
    shortLabel: "体重一覧",
    desc: "体重ログの一覧確認",
    icon: ListChecks,
  },
  {
    href: "/foods",
    label: "フード管理",
    shortLabel: "フード",
    desc: "フードDBの追加・編集・削除",
    icon: Database,
  },
  {
    href: "/meal-sets",
    label: "セット管理",
    shortLabel: "セット",
    desc: "給餌セットの登録・編集・削除",
    icon: Layers3,
  },
  {
    href: "/summary",
    label: "集計",
    shortLabel: "集計",
    desc: "日別・ルール集計・グラフ",
    icon: BarChart3,
  },
];