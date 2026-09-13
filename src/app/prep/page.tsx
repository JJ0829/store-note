import type { Metadata } from "next";
import Link from "next/link";
import RecipeSearch from "@/components/RecipeSearch";
import BackButton from "@/components/BackButton";
import ServerStoreGate from "@/components/ServerStoreGate";
import {
  countedTasks,
  getStore,
  irreversibleTasks,
  listPrepLists,
  listRecipes,
} from "@/lib/repo";

/* ------------------------------------------------------------------ *
 * 프렙 — 목록과 레시피 찾기를 한 화면에 (2026-09-10)
 *
 * ★ 왜 합쳤나 (사장님 지적: "아이콘이 왜 아직 프렙, 레시피 따로 있노")
 *
 *   프렙 항목 안에 레시피가 통째로 들어간 뒤로(재료 + 만드는 순서),
 *   탭에 둘을 나란히 두면 **무엇이 다른지 알 수 없다.**
 *
 *   실제로 다른 것은 이것이다 —
 *     프렙   : **오늘 할 것.** 시간이 정해져 있다 (14:00 오후 프렙)
 *     레시피 : **주문 받고 찾는 것.** 아메리카노는 프렙 항목이 아니다
 *   그건 탭 두 개가 아니라 **한 화면의 두 묶음**이면 된다.
 *
 * ⚠️ **이름은 `프렙` 그대로다.** 한때 `만들기` 로 바꿨다가 되돌렸다 —
 *   프렙은 **매장에서 쓰는 말**이고 내가 지어낼 것이 아니다.
 *   화면 이름을 바꾸면 직원이 서로 다른 말로 부르게 된다.
 *   (사장님 지적 2026-09-10: "왜 프렙을 만들기로 니 맘대로 바꾸는데")
 *
 * ⚠️ 이 화면은 `StoreGate` 안에 있다. 레시피가 여기 있기 때문이다.
 *
 *   **2026-09-10 정정** — 예전에는 여기에 "`/prep/<슬러그>` 는 잠금이 없다,
 *   이 화면이 막는 것은 레시피 목록을 훑는 것뿐" 이라고 적혀 있었다.
 *   그 말은 **프렙 안에 레시피를 합치기 전까지만** 맞았다. 합친 뒤로는
 *   상세 화면이 배합을 통째로 보여주는데 게이트는 목록에만 있었다.
 *   지금은 `/prep/<슬러그>` 도 같은 게이트 안에 있다.
 *   (그마저도 가림막이다 — `21_화면명세.md` §4)
 * ------------------------------------------------------------------ */

export const metadata: Metadata = {
  title: "할 일",
  robots: { index: false, follow: false },
};

export default async function PrepIndexPage() {
  const store = getStore();
  const prepLists = listPrepLists();
  const recipes = listRecipes();

  return (
    <ServerStoreGate title="할 일">
      <main className="mx-auto min-h-dvh w-full max-w-[720px] bg-zinc-50 px-4 py-8 pb-28 dark:bg-zinc-950">
        {/* ★ 뒤로 가기 — 제목과 같은 줄 (사장님 지시 2026-09-13).
            매장 태블릿은 전체화면이라 주소창이 없다. 화면 안에 없으면 갇힌다.
            기록이 있으면 뒤로, 없으면 홈으로 간다 (BackButton). */}
        <div className="flex items-center gap-3">
          <BackButton />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {store.name}
            </p>
            <h1 className="text-2xl font-bold">할 일</h1>
          </div>
        </div>

        {/* ---------- 오늘 할 것 ---------- */}
        <section className="mt-6">
          <h2 className="text-[15px] font-bold">오늘 할 것</h2>
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
                      <span className="block text-[15px] font-bold">{list.name}</span>
                      <span className="mt-0.5 block text-[12px] text-zinc-500 dark:text-zinc-400">
                        {/* 홈·프렙 화면과 같은 규칙으로 센다 (repo.countedTasks) */}
                        {countedTasks(list)}개
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
                    <span aria-hidden className="shrink-0 text-zinc-400">
                      ›
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---------- 주문 받고 찾을 때 ---------- */}
        <section className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <h2 className="text-[15px] font-bold">주문 받고 찾을 때</h2>
          <p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">
            할 일 목록에 없는 메뉴는 여기서 이름으로 찾습니다.
          </p>
          <RecipeSearch recipes={recipes} />
        </section>

        <p className="mt-8 rounded-xl bg-zinc-100 px-3.5 py-3 text-[12px] leading-relaxed text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          레시피는 매장 자산입니다. 검색에 노출되지 않게 막아두었고, 매장 번호를
          걸면 화면에 바로 뜨지 않습니다. 다만 <b>이건 가림막이지 잠금이 아닙니다</b>
          — 링크를 받은 사람이 페이지 소스를 열면 내용이 보입니다. 진짜 차단은
          서버를 붙일 때 됩니다. <b>레시피 링크는 매장 밖으로 보내지 마세요.</b>
        </p>
      </main>
    </ServerStoreGate>
  );
}
