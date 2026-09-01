"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import RecipeDetail from "@/components/RecipeDetail";
import { getLocalRecipe, removeLocalRecipe } from "@/lib/localRecipes";
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
            removeLocalRecipe(recipe.id);
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
