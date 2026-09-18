"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import RecipeDetail from "@/components/RecipeDetail";
import { getLocalRecipe, removeLocalRecipe } from "@/lib/localRecipes";
import { deleteRows, lineId, serverRecipeId } from "@/lib/serverSync";
import type { Recipe } from "@/lib/types";

export default function LocalRecipeView({ storeName }: { storeName: string }) {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setRecipe(id ? getLocalRecipe(id) : null);
    setLoaded(true);
  }, [id]);

  if (!loaded) return null;

  if (!recipe) {
    return (
      <main className="mx-auto min-h-dvh w-full max-w-[720px] px-4 py-16 text-center">
        <p className="text-[15px] font-bold">레시피를 찾을 수 없습니다.</p>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          직접 추가한 레시피는 <b>추가한 기기에만</b> 저장됩니다.
          다른 태블릿이나 폰에서는 보이지 않습니다.
        </p>
        <Link
          href="/r"
          className="mt-6 inline-block rounded-xl border border-zinc-300 px-4 py-3 text-[14px] font-semibold dark:border-zinc-700"
        >
          레시피 목록으로
        </Link>
      </main>
    );
  }

  return (
    <>
      <RecipeDetail recipe={recipe} storeName={storeName} />
      <div className="mx-auto -mt-16 w-full max-w-[720px] px-4 pb-12">
        <button
          type="button"
          onClick={() => {
            if (!window.confirm(`"${recipe.name}" 레시피를 삭제할까요?`)) return;
            // ★ 지우기도 저장이다. 실패한 채로 목록으로 보내면 사장님은
            //   지운 줄 알고 나가고, 레시피는 그대로 남아 있다
            if (!removeLocalRecipe(recipe.id)) {
              window.alert(
                "삭제에 실패했습니다. 브라우저 저장 공간을 확인해 주세요. 레시피는 그대로 남아 있습니다.",
              );
              return;
            }
            /* ★ 서버에서도 지운다 (2026-09-18). 안 지우면 다음에 화면을 열 때
               **서버 사본이 이겨서 지운 레시피가 되살아난다** — 같은 일을
               출퇴근(9/18)·거래처(9/15)에서 이미 겪었다.
               지우는 순서는 매다는 순서의 반대다: 스텝 → 섹션 → 재료 줄 → 판.
               ⚠️ **cascade 가 없다**(`confdeltype = 'a'`). 재료 줄을 남겨두고
               판을 지우면 외래키가 거부하고, 그 실패는 아무데도 안 뜬다.
               줄 id 는 «레시피 + 재료 이름» 에서 정해지므로 다시 만들 수 있다.
               품목(`items`)은 안 지운다 — 다른 레시피가 쓰고 있을 수 있다. */
            const vid = serverRecipeId(recipe.id);
            const secIds = recipe.sections.map((x) => x.id);
            const stepIds = recipe.sections.flatMap((x) => x.steps.map((y) => y.id));
            const lineIds = recipe.ingredients.map((g) => lineId(recipe.id, g.name));
            void (async () => {
              await deleteRows("steps", stepIds);
              await deleteRows("sections", secIds);
              await deleteRows("make_recipe_lines", lineIds);
              await deleteRows("make_recipe_versions", [vid]);
            })();
            router.push("/r");
          }}
          className="w-full rounded-xl border border-red-300 py-3 text-[13px] font-semibold text-red-600 active:bg-red-50 dark:border-red-900 dark:text-red-400"
        >
          이 레시피 삭제
        </button>
      </div>
    </>
  );
}
