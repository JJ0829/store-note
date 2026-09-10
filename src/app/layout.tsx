import type { Metadata, Viewport } from "next";
import "./globals.css";
import TabBar from "@/components/TabBar";

/**
 * 배포 주소. 배포처(Vercel 등)에서 환경변수로 넣는다.
 *
 * ★ **빌드 시점에 박힌다.** 값을 바꾸면 다시 배포해야 한다.
 *   안 넣으면 카카오톡·문자로 링크를 보냈을 때 미리보기가 안 뜬다 —
 *   체크리스트를 카톡으로 보내는 것이 이 제품의 실제 사용 경로다.
 *   (01_MVP기획서 §10.3 (나) #13)
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  title: "매장수첩",
  description: "포지션별로 오늘 할 일을 순서대로 확인하세요.",
  /* 검색에 걸리면 안 된다. 레시피는 영업비밀이고, 체크리스트 링크도
     남의 매장 사람이 열어볼 이유가 없다. 화면마다 따로 걸면 빠뜨리므로
     여기서 전체에 건다. (06_보안설계.md V-09) */
  robots: { index: false, follow: false },
  ...(SITE_URL ? { metadataBase: new URL(SITE_URL) } : {}),
  openGraph: {
    title: "매장수첩",
    /* ★ 미리보기 글에 매장 이름·레시피를 넣지 않는다.
       카톡방에 뜨는 글은 링크를 받은 사람 말고도 본다. */
    description: "오늘 할 일을 순서대로.",
    type: "website",
    locale: "ko_KR",
  },
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
      <body className="antialiased">
        {children}
        {/* 매장 태블릿은 전체화면 키오스크라 주소창이 없는 경우가 많다.
            탭바가 없으면 깊이 들어갔을 때 `‹ 뒤로` 를 여러 번 눌러야 나온다.
            교육 모드·체크리스트에서는 TabBar 가 스스로 안 그린다 */}
        <TabBar />
      </body>
    </html>
  );
}
