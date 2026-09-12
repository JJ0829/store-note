import type { ReactNode } from "react";

/* ------------------------------------------------------------------ *
 * 접었다 펴는 묶음 (▼).
 *
 * ★ 왜 필요했나 (사장님 지적 2026-09-12: "자잘한 게 너무 많다")
 *   첫 화면에 섹션이 여섯이라 스크롤이 길었다. 그런데 그중 **매일 여는 것은
 *   둘뿐**이다 — 지금 근무조와 프렙. 나머지(사람·돈·교육·촬영·레시피)는
 *   주 1회거나 신입이 올 때만 연다. 그것들이 매일 자리를 차지하고 있었다.
 *
 * ★ `<details>` 를 쓴다. 자바스크립트가 없어도 열린다 —
 *   이 화면은 서버가 그려 보내는 화면이고, 스크립트가 늦게 붙는 태블릿에서도
 *   눌리면 열려야 한다. 상태를 리액트로 들고 있으면 그게 안 된다.
 *   스크린리더도 `<summary>` 를 «접힘/펼침» 으로 그대로 읽는다.
 * ------------------------------------------------------------------ */
export default function Fold({
  title,
  note,
  count,
  open = false,
  children,
}: {
  title: string;
  /** 펼쳤을 때 맨 위에 붙는 한 줄. 접혀 있을 때는 안 보인다 */
  note?: string;
  /** 제목 옆 작은 숫자 — 열지 않고도 몇 개인지 보이게 */
  count?: string;
  /** 매일 여는 묶음만 펼친 채로 둔다 */
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={open}
      className="group mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      <summary
        className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 active:bg-zinc-50 dark:active:bg-zinc-800 [&::-webkit-details-marker]:hidden"
      >
        <span className="min-w-0">
          <span className="text-[15px] font-bold">{title}</span>
          {count && (
            <span className="ml-2 text-[12px] font-normal text-zinc-500 dark:text-zinc-400">
              {count}
            </span>
          )}
        </span>
        {/* 열리면 돌아간다. 화살표가 방향을 말해주지 않으면 눌러야 할지 모른다 */}
        <span
          aria-hidden
          className="shrink-0 text-[13px] text-zinc-400 transition-transform group-open:rotate-180"
        >
          ▼
        </span>
      </summary>

      <div className="border-t border-zinc-100 px-4 pb-4 pt-3 dark:border-zinc-800">
        {note && (
          <p className="mb-3 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            {note}
          </p>
        )}
        {children}
      </div>
    </details>
  );
}
