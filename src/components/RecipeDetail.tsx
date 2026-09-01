"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import { SCALES, scaled } from "@/lib/scale";
import type { Recipe } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * 레시피 상세.
 *
 * 메뉴 30개는 벽에 못 붙인다. 여기가 태블릿이 종이를 확실히 이기는 자리다.
 * 그리고 "1배합=6개인데 9개 필요"를 매번 암산하게 두면 실수가 난다.
 * ------------------------------------------------------------------ */

function getSessionId(): string {
  const KEY = "sop:sid";
  try {
    let sid = localStorage.getItem(KEY);
    if (!sid) {
      sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(KEY, sid);
    }
    return sid;
  } catch {
    return "no-storage";
  }
}

function log(event: string, payload: Record<string, unknown>) {
  try {
    void fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, sessionId: getSessionId(), ...payload }),
      keepalive: true,
    });
  } catch {
    /* 로깅 실패가 사용을 막으면 안 된다 */
  }
}

function youtubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/,
  );
  return m ? m[1] : null;
}

export default function RecipeDetail({
  recipe,
  storeName,
}: {
  recipe: Recipe;
  storeName: string;
}) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    log("recipe_view", { recipeSlug: recipe.slug });
  }, [recipe.slug]);

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[720px] bg-zinc-50 pb-24 dark:bg-zinc-950">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="flex items-center justify-between gap-3">
          <BackButton fallback="/r" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {storeName} · {recipe.category}
            </p>
            <h1 className="truncate text-lg font-bold">{recipe.name}</h1>
          </div>
          <Link
            href="/r"
            className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
          >
            목록
          </Link>
        </div>
      </header>

      {/* ---------- 배수 ---------- */}
      <section className="px-4 pt-4">
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-900/60 dark:bg-orange-950/40">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-bold text-orange-900 dark:text-orange-100">
              몇 배로 만드나요?
            </span>
            {SCALES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setScale(s);
                  log("recipe_scale", { recipeSlug: recipe.slug, scale: s });
                }}
                className={[
                  "min-w-[56px] rounded-xl border-2 px-3 py-2.5 text-[15px] font-bold tabular-nums transition-colors",
                  scale === s
                    ? "border-orange-500 bg-orange-500 text-white"
                    : "border-orange-200 bg-white text-orange-800 active:bg-orange-100 dark:border-orange-900 dark:bg-zinc-900 dark:text-orange-200",
                ].join(" ")}
              >
                {s}배
              </button>
            ))}
          </div>

          <p className="mt-3 text-[15px] font-bold text-orange-900 dark:text-orange-100">
            {recipe.yield.amount}
            {recipe.yield.unit} → {scaled(recipe.yield.amount, scale)}
            {recipe.yield.unit} 나옵니다
          </p>
        </div>
      </section>

      {/* ---------- 재료 ---------- */}
      <section className="px-4 pt-6">
        <h2 className="text-[15px] font-bold">재료</h2>
        <ul className="mt-2 divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {recipe.ingredients.map((ing) => (
            <li
              key={ing.name}
              className="flex items-baseline justify-between gap-3 px-4 py-3"
            >
              <span className="min-w-0 text-[15px] text-zinc-700 dark:text-zinc-200">
                {ing.name}
                {ing.note && (
                  // 배합률(60%, 6%)은 배수를 곱해도 그대로다. 그래서 기준이 된다.
                  <span className="ml-1.5 text-[12px] text-zinc-400">
                    {ing.note}
                  </span>
                )}
              </span>
              <span
                className={[
                  "shrink-0 text-[17px] font-bold tabular-nums",
                  scale !== 1 ? "text-orange-600 dark:text-orange-400" : "",
                ].join(" ")}
              >
                {scaled(ing.amount, scale)}
                {ing.unit}
              </span>
            </li>
          ))}
        </ul>
        {scale !== 1 && (
          <p className="mt-2 text-[12px] text-zinc-500 dark:text-zinc-400">
            {scale}배로 계산된 값입니다. 퍼센트는 배수와 상관없이 그대로입니다.
          </p>
        )}
      </section>

      {/* ---------- 만드는 순서 ---------- */}
      {recipe.sections.map((section) => (
        <section key={section.id} className="px-4 pt-6">
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <h2 className="text-[15px] font-bold">{section.title}</h2>
            {section.note && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {section.note}
              </span>
            )}
          </div>

          <ol className="flex flex-col gap-2">
            {section.steps.map((step, i) => {
              const ytId = step.videoUrl ? youtubeId(step.videoUrl) : null;
              return (
                <li
                  key={step.id}
                  className={[
                    "overflow-hidden rounded-2xl border bg-white dark:bg-zinc-900",
                    step.critical
                      ? "border-red-200 dark:border-red-900/60"
                      : "border-zinc-200 dark:border-zinc-800",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3 p-4">
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[13px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      {step.critical && (
                        <span className="mb-1 inline-block rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                          꼭 지키기
                        </span>
                      )}
                      <h3 className="text-[15px] font-semibold leading-snug">
                        {step.title}
                      </h3>
                      <p className="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                        {step.desc}
                      </p>
                      {step.tip && (
                        <p className="mt-2 rounded-lg bg-zinc-100 px-2.5 py-2 text-[12px] leading-relaxed text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          <span className="font-semibold">선배 한마디 </span>
                          {step.tip}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 좋은 예 / 나쁜 예 — 주방 판단 기준은 대부분 이 이분법이다 */}
                  {(step.goodImage || step.badImage || ytId) && (
                    <div className="px-4 pb-4 pl-[3.75rem]">
                      {(step.goodImage || step.badImage) && (
                        <div className="grid grid-cols-2 gap-2">
                          {step.goodImage && (
                            <figure>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={step.goodImage}
                                alt={`${step.title} 좋은 예`}
                                loading="lazy"
                                className="w-full rounded-xl border-2 border-emerald-300 dark:border-emerald-800"
                              />
                              <figcaption className="mt-1 text-center text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                                이렇게
                              </figcaption>
                            </figure>
                          )}
                          {step.badImage && (
                            <figure>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={step.badImage}
                                alt={`${step.title} 나쁜 예`}
                                loading="lazy"
                                className="w-full rounded-xl border-2 border-red-300 dark:border-red-900"
                              />
                              <figcaption className="mt-1 text-center text-[11px] font-bold text-red-700 dark:text-red-400">
                                이러면 안 됨
                              </figcaption>
                            </figure>
                          )}
                        </div>
                      )}
                      {ytId && (
                        <div className="mt-2 aspect-video w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                          <iframe
                            src={`https://www.youtube.com/embed/${ytId}`}
                            title={`${step.title} 영상`}
                            allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                            allowFullScreen
                            className="h-full w-full"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      <div className="px-4 pt-8">
        <Link
          href="/r"
          className="block w-full rounded-xl border border-zinc-300 py-3 text-center text-[13px] font-medium text-zinc-500 active:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:active:bg-zinc-800"
        >
          레시피 목록으로
        </Link>
      </div>
    </div>
  );
}
