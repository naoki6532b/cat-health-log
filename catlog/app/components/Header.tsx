"use client";

import Link from "next/link";

export default function Header() {
  return (
    <header
      style={{
        padding: "10px 16px",
        borderBottom: "1px solid #ccc",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <Link href="/" style={{ fontWeight: "bold" }}>
        🐱 猫健康ログ（トップ）
      </Link>

      <nav style={{ display: "flex", gap: 12 }}>
        <Link href="/entry/meal">給餌入力</Link>
        <Link href="/entry/elim">排泄入力</Link>
        <Link href="/foods">フード管理</Link>
        <Link href="/summary">集計</Link>
      </nav>
    </header>
  );
}