"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Recipe } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * 이름으로 찾기.
 *
 * 주방에서는 스크롤로 훑을 시간이 없다. 두세 글자 치면 나와야 한다.
 * 젖은 손·장갑을 고려해 입력창과 항목을 크게 잡는다.
 * ------------------------------------------------------------------ */

export default function RecipeSearch({ recipes }: { recipes: Recipe[] }) {
  const [q, setQ] = useState("");

  const categories = useMemo(
    () => [...new Set(recipes.map((r) => r.category))],
    [recipes],
  );

  const hit = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return recipes;
    return recipes.filter(
      (r) =>
        r.name.toLowerCase().includes(k) || r.category.toLowerCase().includes(k),
    );
  }, [q, recipes]);

  return (
    <>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="메뉴 이름 (예: 라떼)"
        aria-label="레시피 검색"
        className="mt-4 w-full rounded-2xl border-2 border-zinc-300 bg-white px-4 py-3.5 text-[16px] outline-none placeholder:text-zinc-400 focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-900"
      />

      {/* 분류 바로가기 — 이름이 기억 안 날 때 */}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setQ("")}
          className={[
            "rounded-lg border px-3 py-1.5 text-[13px] font-semibold",
            q === ""
              ? "border-orange-500 bg-orange-500 text-white"
              : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300",
          ].join(" ")}
        >
          전체
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setQ(c)}
            className={[
              "rounded-lg border px-3 py-1.5 text-[13px] font-semibold",
              q === c
                ? "border-orange-500 bg-orange-500 text-white"
                : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300",
            ].join(" ")}
          >
            {c}
          </button>
        ))}
      </div>

      {hit.length === 0 ? (
        <p className="mt-8 text-center text-[14px] text-zinc-500 dark:text-zinc-400">
          &ldquo;{q}&rdquo; 에 해당하는 레시피가 없습니다.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {hit.map((r) => (
            <li key={r.id}>
              <Link
                href={`/r/${r.slug}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-4 active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:active:bg-zinc-800"
              >
                <span className="min-w-0">
                  <span className="block text-[16px] font-bold">
                    {r.name}
                    {r.forNewbie && (
                      <span className="ml-2 rounded-md bg-orange-100 px-1.5 py-0.5 align-middle text-[11px] font-bold text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                        첫 주
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-zinc-500 dark:text-zinc-400">
                    {r.category} · 1배합 {r.yield.amount}
                    {r.yield.unit} · 재료 {r.ingredients.length}개
                  </span>
                </span>
                <span aria-hidden className="shrink-0 text-lg text-zinc-400">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
