import type { Metadata } from "next";
import Link from "next/link";
import RecipeSearch from "@/components/RecipeSearch";
import { getStore, listRecipes } from "@/lib/repo";

// 레시피는 영업비밀이다. 체크리스트와 달리 검색에 걸리면 안 된다.
// (제대로 된 접근 제한은 매장 PIN. 배포 전 작업 목록에 있다)
export const metadata: Metadata = {
  title: "레시피",
  robots: { index: false, follow: false },
};

export default function RecipeListPage() {
  const store = getStore();
  const recipes = listRecipes();

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[720px] bg-zinc-50 px-4 py-8 dark:bg-zinc-950">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
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
        레시피는 매장 자산입니다. 이 화면은 검색에 노출되지 않게 막아두었고,
        매장 PIN 잠금은 배포 전에 붙입니다.
      </p>
    </main>
  );
}
