import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mizuta Map",
  description: "水たまりを見つけて、共有して、魚を泳がせるマップアプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
