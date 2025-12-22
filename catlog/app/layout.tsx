import type { Metadata } from "next";
import Header from "./components/Header";

export const metadata: Metadata = {
  title: "猫健康ログ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}