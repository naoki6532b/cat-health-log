"use client";

import Link from "next/link";

export default function Header() {
  return (
    <header style={{ padding: "10px 16px", borderBottom: "1px solid #ccc", marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Link href="/" style={{ fontWeight: "bold" }}>
          🐱 猫健康ログ（トップ）
        </Link>
        <Link href="/entry/meal">給餌入力</Link>
        <Link href="/entry/elim">排泄入力</Link>
        <Link href="/foods">フード管理</Link>
        <Link href="/summary">集計</Link>
      </div>
    </header>
  );
}