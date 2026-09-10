import type { Metadata } from "next";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import RecipeSearch from "@/components/RecipeSearch";
import ServerStoreGate from "@/components/ServerStoreGate";
import { getStore, listRecipes } from "@/lib/repo";

// 레시피는 영업비밀이다. 체크리스트와 달리 검색에 걸리면 안 된다.
// 매장 PIN 잠금은 `StoreGate`가 건다 (2026-09-07). 검색 차단은 그대로 둔다 —
// 둘은 막는 상대가 다르다: robots는 크롤러, StoreGate는 링크 받은 사람.
export const metadata: Metadata = {
  title: "레시피",
  robots: { index: false, follow: false },
};

export default async function RecipeListPage() {
  const store = getStore();
  const recipes = listRecipes();

  return (
    <ServerStoreGate title="레시피">
      <main className="mx-auto min-h-dvh w-full max-w-[720px] bg-zinc-50 px-4 py-8 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-3">
          <BackButton />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {store.name}
            </p>
            <h1 className="mt-1 text-2xl font-bold">레시피</h1>
          </div>
          <Link
            href="/"
            className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
          >
            처음으로
          </Link>
        </div>

        <RecipeSearch recipes={recipes} />

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
