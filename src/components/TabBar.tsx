"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* ------------------------------------------------------------------ *
 * 하단 탭바
 *
 * ★ 왜 생겼나 (2026-09-10)
 *
 *   매장 태블릿은 **전체화면 키오스크라 주소창이 없는 경우가 많다**
 *   (`BackButton.tsx` 주석). 그 상태에서 `/attendance` → `/sales` 처럼
 *   두세 번 들어가면 `‹ 뒤로` 를 그만큼 눌러야 나온다.
 *   단일 파일 데모에는 탭바가 있었는데 **Next 앱에는 없었다** —
 *   두 앱의 이동이 갈려 있던 유일한 지점이었다
 *   (`docs/deliverables/21_화면명세.md` §4-b · `22_클릭흐름.md` §5).
 *
 * ★ 탭은 **매일 누르는 것**만 둔다
 *
 *   단일 파일의 옛 탭은 `오늘·프렙·레시피·근무표·교육·운영` 여섯이었다.
 *   그런데 근무표는 주 1회, 교육은 신입 올 때만인데 탭에 있었고
 *   **하루 두 번 찍는 출퇴근과 매일 아침 여는 발주가 탭에 없었다.**
 *   매일 누르는 게 탭에 없고 한 달에 한 번 쓰는 게 탭에 있었던 것이다.
 *   → CLAUDE.md "기능 추가 요청이 오면 **매일 열리는 이유**를 늘리는지 먼저 따질 것"
 *
 * ★ 프렙과 레시피를 `만들기` 하나로 합쳤다
 *
 *   프렙 항목 안에 레시피가 통째로 들어간 뒤로(2026-09-10) 둘을 나란히
 *   두면 무엇이 다른지 알 수 없다. 실제로 다른 것은
 *   **오늘 할 것(프렙)** 과 **주문 받고 찾는 것(레시피)** 인데,
 *   그건 한 화면 안의 두 묶음이면 된다.
 *
 *   근무표는 운영으로, 교육은 홈의 포지션 카드로 간다.
 * ------------------------------------------------------------------ */

type Tab = {
  href: string;
  label: string;
  /** 이 탭이 켜지는 경로들. 하위 화면에서도 상위 탭이 켜져 있어야 지금 어디인지 안다 */
  match: string[];
  icon: React.ReactNode;
};

const TABS: Tab[] = [
  {
    href: "/",
    label: "오늘",
    match: ["/"],
    icon: <path d="M3 10.5 12 4l9 6.5V19a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  },
  {
    href: "/make",
    label: "만들기",
    match: ["/make", "/prep", "/r"],
    icon: (
      <>
        <path d="M5 4h11l3 3v13H5z" />
        <path d="M9 10h6M9 14h6" />
      </>
    ),
  },
  {
    href: "/order",
    label: "발주",
    match: ["/order"],
    icon: (
      <>
        <path d="M3 6h13l2 9H6z" />
        <circle cx="8" cy="19" r="1.6" />
        <circle cx="16" cy="19" r="1.6" />
      </>
    ),
  },
  {
    href: "/attendance",
    label: "출퇴근",
    match: ["/attendance"],
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  {
    href: "/sales",
    label: "운영",
    match: ["/sales", "/cost", "/vendors", "/contracts", "/roster", "/backup"],
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.6-1.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 1 1 4 0v.6a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 21 11a2 2 0 1 1 0 4 1.6 1.6 0 0 0-1.6 1z" />
      </>
    ),
  },
];

/** 이 경로에서 이 탭이 켜지는가. `/prep/afternoon` 도 `/prep` 으로 잡는다 */
function isOn(pathname: string, tab: Tab): boolean {
  return tab.match.some((m) =>
    m === "/" ? pathname === "/" : pathname === m || pathname.startsWith(`${m}/`),
  );
}

export default function TabBar() {
  const pathname = usePathname() || "/";

  /* 교육 모드와 체크리스트는 탭을 안 그린다.
     ⓐ 교육 모드는 한 장씩 넘기는 **한 방향 흐름**이라 중간에 새는 문이 있으면 안 된다
     ⓑ 체크리스트는 카카오톡 링크로 **직원 개인 폰**에서 여는 화면이다 —
        거기에 매출·출퇴근 탭을 띄우면 남의 매장 사람에게 문을 여는 셈이다 */
  if (pathname.startsWith("/t/") || pathname.startsWith("/p/")) return null;

  return (
    <nav
      aria-label="주요 화면"
      /* env(safe-area-inset-bottom) — 아이패드 홈 인디케이터에 가리면 못 누른다 */
      className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95"
    >
      <ul className="mx-auto flex w-full max-w-[560px]">
        {TABS.map((tab) => {
          const on = isOn(pathname, tab);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={on ? "page" : undefined}
                /* 젖은 손으로 누른다 — 표적을 세로로 넉넉히 잡는다 */
                className={[
                  "flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold active:bg-zinc-100 dark:active:bg-zinc-800",
                  on
                    ? "text-orange-600 dark:text-orange-400"
                    : "text-zinc-500 dark:text-zinc-400",
                ].join(" ")}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  focusable="false"
                  className="h-[22px] w-[22px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {tab.icon}
                </svg>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
