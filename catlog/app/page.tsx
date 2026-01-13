"use client";
import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: 16 }}>
      <h2>猫ログ</h2>
      <h1 className="text-2xl font-bold">TEST</h1>

      <ul>
        <li><Link href="/foods">キャットフードDB 管理</Link></li>
        <li><Link href="/entry/meal">給餌入力</Link></li>
        <li><Link href="/entry/elim">排泄入力</Link></li>
        <li><Link href="/summary">集計（15分ルール/日別/グラフ）</Link></li>
      </ul>
    </main>
  );
}