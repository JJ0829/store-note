"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { copyText } from "@/lib/copyText";
import { isLocal, loadLocalRecipes } from "@/lib/localRecipes";
import type { Recipe } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * 이름으로 찾기.
 *
 * 주방에서는 스크롤로 훑을 시간이 없다. 두세 글자 치면 나와야 한다.
 * 젖은 손·장갑을 고려해 입력창과 항목을 크게 잡는다.
 *
 * 목록 = 시드 레시피 + 이 기기에서 직접 추가한 레시피.
 * ------------------------------------------------------------------ */

export default function RecipeSearch({ recipes }: { recipes: Recipe[] }) {
  const [q, setQ] = useState("");
  const [mine, setMine] = useState<Recipe[]>([]);

  useEffect(() => {
    setMine(loadLocalRecipes());
  }, []);

  const all = useMemo(() => [...recipes, ...mine], [recipes, mine]);

  const categories = useMemo(
    () => [...new Set(all.map((r) => r.category))],
    [all],
  );

  const hit = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return all;
    return all.filter(
      (r) =>
        r.name.toLowerCase().includes(k) || r.category.toLowerCase().includes(k),
    );
  }, [q, all]);

  function href(r: Recipe): string {
    // 직접 추가한 것은 빌드 때 주소가 없으므로 ?id= 로 연다
    return isLocal(r) ? `/r/my?id=${r.id}` : `/r/${r.slug}`;
  }

  function exportJson() {
    // 서버 DB가 붙기 전까지, 입력한 것이 기기와 함께 사라지지 않게 하는 안전장치
    const blob = JSON.stringify(mine, null, 2);
    void copyText(blob, "아래 내용을 복사해 보관하세요").then((r) => {
      if (r === "copied") window.alert("추가한 레시피를 복사했습니다.");
    });
  }

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

      <Link
        href="/r/new"
        className="mt-2 flex items-center justify-center gap-1.5 rounded-2xl bg-orange-500 py-3.5 text-[15px] font-bold text-white active:bg-orange-600"
      >
        <span aria-hidden className="text-lg leading-none">
          +
        </span>
        레시피 추가
      </Link>

      {/* 분류 바로가기 — 이름이 기억 안 날 때 */}
      <div className="mt-3 flex flex-wrap gap-2">
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
          전체 {all.length}
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
        <div className="mt-8 text-center">
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
            &ldquo;{q}&rdquo; 에 해당하는 레시피가 없습니다.
          </p>
          <Link
            href="/r/new"
            className="mt-4 inline-block rounded-xl border-2 border-orange-500 px-4 py-3 text-[14px] font-bold text-orange-600 dark:text-orange-400"
          >
            &ldquo;{q}&rdquo; 레시피 추가하기
          </Link>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {hit.map((r) => (
            <li key={r.id}>
              <Link
                href={href(r)}
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
                    {isLocal(r) && (
                      <span className="ml-2 rounded-md bg-zinc-200 px-1.5 py-0.5 align-middle text-[11px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        직접 추가
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

      {mine.length > 0 && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            직접 추가한 레시피 <b>{mine.length}개</b>는 <b>이 기기에만</b>{" "}
            저장돼 있습니다. 다른 태블릿에서는 보이지 않습니다.
          </p>
          <button
            type="button"
            onClick={exportJson}
            className="mt-2 rounded-lg border border-zinc-300 px-3 py-2 text-[12px] font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
          >
            백업용으로 복사하기
          </button>
        </div>
      )}
    </>
  );
}
