import Link from "next/link";
import CopyLinkButton from "@/components/CopyLinkButton";
import NowPanel from "@/components/NowPanel";
import {
  countCritical,
  countTasks,
  getStore,
  irreversibleTasks,
  listPositions,
  listPrepLists,
  listRecipes,
  listShifts,
} from "@/lib/repo";

/**
 * 매장 태블릿의 첫 화면.
 *
 * 맨 위는 "지금 이 시간에 뭘 해야 하는가"다. 그 아래에 전체 목록을 둔다.
 * 순서를 반대로 하면(목록 먼저) 사람이 매번 찾아야 해서 안 쓰게 된다.
 */
export default function Home() {
  const store = getStore();
  const positions = listPositions();
  const prepLists = listPrepLists();
  const recipes = listRecipes();
  const shifts = listShifts();

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[560px] bg-zinc-50 px-4 py-8 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{store.name}</p>
      <h1 className="mt-1 text-2xl font-bold">오늘</h1>

      {/* ---------- 지금 시간에 맞는 화면 ---------- */}
      <NowPanel shifts={shifts} />

      {/* ---------- 프렙 ---------- */}
      <section className="mt-8">
        <h2 className="text-[15px] font-bold">프렙</h2>
        <p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">
          오늘 해야 내일 쓸 수 있는 것들입니다.
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {prepLists.map((list) => {
            const cannotBuy = irreversibleTasks(list).length;
            return (
              <li key={list.id}>
                <Link
                  href={`/prep/${list.slug}`}
                  className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:active:bg-zinc-800"
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold">
                      {list.name}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-zinc-500 dark:text-zinc-400">
                      {list.tasks.length}개
                      {cannotBuy > 0 && (
                        <>
                          {" · "}
                          <b className="text-red-600 dark:text-red-400">
                            까먹지 말 것 {cannotBuy}개
                          </b>
                        </>
                      )}
                    </span>
                  </span>
                  <span aria-hidden className="shrink-0 text-lg text-zinc-400">
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---------- 근무표 ---------- */}
      <section className="mt-8">
        <h2 className="text-[15px] font-bold">근무표</h2>
        <p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">
          누가 언제 나오는지 정하고, 직원들에게 보냅니다.
        </p>
        <Link
          href="/roster"
          className="mt-3 flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:active:bg-zinc-800"
        >
          <span className="text-[15px] font-bold">이번 주 근무표</span>
          <span aria-hidden className="text-lg text-zinc-400">
            ›
          </span>
        </Link>
      </section>

      {/* ---------- 포지션 ---------- */}
      <section className="mt-8">
        <h2 className="text-[15px] font-bold">포지션별 체크리스트</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          첫날 교육은 태블릿에서 교육 모드로 보여주고, 그 뒤에 혼자 확인할 수
          있게 체크리스트 링크를 보내주세요.
        </p>

        <ul className="mt-3 flex flex-col gap-3">
          {positions.map((position) => (
            <li
              key={position.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <h3 className="truncate text-[15px] font-bold">
                {position.name}
                <span className="ml-1.5 text-[13px] font-normal text-zinc-500 dark:text-zinc-400">
                  {position.subtitle}
                </span>
              </h3>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {countTasks(position)}개 항목 · 꼭 지키기{" "}
                {countCritical(position)}개
              </p>

              <div className="mt-3 flex flex-col gap-2">
                <Link
                  href={`/t/${position.shareSlug}`}
                  className="flex items-center justify-between rounded-xl bg-orange-500 px-4 py-3 text-white active:bg-orange-600"
                >
                  <span className="text-[14px] font-bold">교육 모드로 열기</span>
                  <span className="text-[11px] opacity-80">태블릿 · 한 장씩</span>
                </Link>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/p/${position.shareSlug}`}
                    className="flex-1 rounded-xl border border-zinc-300 px-4 py-3 dark:border-zinc-700"
                  >
                    <span className="text-[14px] font-semibold">체크리스트</span>
                    <span className="ml-2 font-mono text-[11px] text-zinc-400">
                      /p/{position.shareSlug}
                    </span>
                  </Link>
                  <CopyLinkButton path={`/p/${position.shareSlug}`} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- 레시피 ---------- */}
      <section id="recipes" className="mt-8">
        <h2 className="text-[15px] font-bold">레시피</h2>
        <p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">
          이름으로 찾고, 필요한 만큼 배수로 계산합니다.
        </p>

        <Link
          href="/r"
          className="mt-3 flex items-center justify-between rounded-2xl bg-zinc-900 px-4 py-3.5 text-white active:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          <span className="text-[15px] font-bold">
            레시피 찾기
            <span className="ml-2 text-[12px] font-normal opacity-70">
              {recipes.length}개
            </span>
          </span>
          <span aria-hidden className="text-lg leading-none">
            ›
          </span>
        </Link>

        <ul className="mt-2 flex flex-wrap gap-2">
          {recipes.map((r) => (
            <li key={r.id}>
              <Link
                href={`/r/${r.slug}`}
                className="block rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13px] active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <b>{r.name}</b>
                <span className="ml-1.5 text-zinc-500 dark:text-zinc-400">
                  1배합 {r.yield.amount}
                  {r.yield.unit}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
