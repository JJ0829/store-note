import type { Metadata } from "next";
import Link from "next/link";

/* ------------------------------------------------------------------ *
 * 없는 주소로 들어왔을 때.
 *
 * ★ 여기 오는 사람이 누구인지가 문구를 정한다.
 *   가장 흔한 경우는 **오래된 카톡 링크를 누른 신입**이다.
 *   `data/seed.json` 의 shareSlug 가 바뀌면 이전에 보낸 링크가 죽는데,
 *   그때 Next 기본 404 화면이 뜨면 첫 출근한 사람이 그 자리에서 막힌다.
 *   "This page could not be found" 를 보고 뭘 해야 할지 알 수 없다.
 *
 *   그래서 이 화면은 세 가지만 한다.
 *     1) 무슨 일이 났는지 평이하게 말한다
 *     2) **무엇을 하면 되는지** 알려준다 (새 링크를 받으면 된다)
 *     3) 첫 화면으로 갈 길을 준다
 *
 *   슬러그 목록을 여기 적지 않는다 — 시드가 바뀌면 이 화면이 먼저 낡고,
 *   매장 밖 사람에게 링크를 알려주는 셈이 된다.
 *
 *   → docs/deliverables/15_인수기준.md AC-07 #1·#2
 * ------------------------------------------------------------------ */

export const metadata: Metadata = {
  title: "링크를 찾을 수 없습니다",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col justify-center bg-zinc-50 px-4 py-8 dark:bg-zinc-950">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">
          매장수첩
        </p>
        <h1 className="mt-2 text-2xl font-bold">이 링크는 열 수 없습니다</h1>

        <p className="mt-3 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300">
          주소가 잘못되었거나, <b>예전에 받은 링크가 바뀌었을 수 있습니다.</b>
        </p>

        <div className="mt-5 rounded-xl bg-zinc-100 px-4 py-3.5 dark:bg-zinc-800">
          <p className="text-[13px] font-bold">이렇게 하시면 됩니다</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
            <li>
              · <b>선배나 사장님께 링크를 다시 받아주세요.</b> 오늘 볼 체크리스트
              주소가 바뀌었을 수 있습니다.
            </li>
            <li>· 매장 태블릿이면 아래 버튼으로 첫 화면에서 다시 고르세요.</li>
          </ul>
        </div>

        <Link
          href="/"
          className="mt-5 flex items-center justify-between rounded-2xl bg-zinc-900 px-4 py-3.5 text-white active:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          <span className="text-[15px] font-bold">첫 화면으로 가기</span>
          <span aria-hidden className="text-lg leading-none">
            ›
          </span>
        </Link>
      </div>
    </main>
  );
}
