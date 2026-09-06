import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "매장수첩",
  description: "포지션별로 오늘 할 일을 순서대로 확인하세요.",
  /* 검색에 걸리면 안 된다. 레시피는 영업비밀이고, 체크리스트 링크도
     남의 매장 사람이 열어볼 이유가 없다. 화면마다 따로 걸면 빠뜨리므로
     여기서 전체에 건다. (06_보안설계.md V-09) */
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#18181b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
