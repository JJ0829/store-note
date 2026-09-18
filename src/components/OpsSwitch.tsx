import Link from "next/link";

/* ------------------------------------------------------------------ *
 * 운영 전환 — 매출 · 원가 · 거래처 (2026-09-18)
 *
 * ★ 사장님 지적: *"운영에서 매출만 보일 게 아니고 원가, 거래처 같이 보여야지"*.
 *
 *   탭바의 「운영」 을 누르면 매출 화면 하나만 열렸다. 그런데 이 셋은
 *   **한 계산의 세 조각**이다 —
 *
 *       거래처(단가) → 원가(재료비) → 매출(남은 돈)
 *
 *   원가가 이상하면 거래처 단가를 봐야 하고, 남은 돈이 이상하면 원가를
 *   봐야 한다. 오갈 때마다 홈을 거치면 그 확인을 안 하게 된다.
 *
 * ★ 출퇴근 ↔ 근무표의 `WorkSwitch` 와 같은 꼴이다. 라우트는 그대로 두고
 *   화면 맨 위에 스위치만 얹는다 — 잠금이 화면마다 다르기 때문이다
 *   (매출·거래처는 사장님 PIN, 원가는 2026-09-11 에 풀렸다).
 * ------------------------------------------------------------------ */

const BASE =
  "flex-1 rounded-lg px-2 py-2 text-center text-[14px] font-bold transition-colors";

const TABS = [
  { href: "/sales", key: "sales", label: "매출", sub: "남은 돈" },
  { href: "/cost", key: "cost", label: "원가", sub: "재료비" },
  { href: "/vendors", key: "vendors", label: "거래처", sub: "단가" },
] as const;

export default function OpsSwitch({
  current,
}: {
  current: "sales" | "cost" | "vendors";
}) {
  return (
    <div
      role="tablist"
      aria-label="매출·원가·거래처"
      className="mt-4 flex gap-1 rounded-xl bg-zinc-200/70 p-1 dark:bg-zinc-800"
    >
      {TABS.map((t) => {
        const on = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={on}
            className={[
              BASE,
              on
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                : "text-zinc-500 active:bg-zinc-200 dark:text-zinc-400 dark:active:bg-zinc-700",
            ].join(" ")}
          >
            {t.label}{" "}
            <span className="font-normal text-[12px]">({t.sub})</span>
          </Link>
        );
      })}
    </div>
  );
}
