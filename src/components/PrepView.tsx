"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import MediaSlot from "@/components/MediaSlot";
import { SCALES, scaled } from "@/lib/scale";
import { businessDay, dayKey, pruneDayKeys } from "@/lib/businessDay";
import { arrivesIn, readyAt, triggerLabel } from "@/lib/leadTime";
import type { PrepList, PrepTask, Recipe } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * 프렙 리스트 — 이 제품이 종이를 이기는 지점
 *
 * 종이 체크리스트가 못 하는 것이 여기 셋 다 들어간다.
 *   1) 오늘 걸면 몇 시에 쓸 수 있는지 계산해준다 (종이는 계산 못 함)
 *   2) 되돌릴 수 있는 것과 없는 것을 구분한다 (종이는 전부 같은 줄)
 *   3) 수량이 매일 바뀌는 항목은 배수를 눌러서 그 자리에서 환산한다
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

/* 리드타임 계산(readyAt · arrivesIn · triggerLabel)은 @/lib/leadTime 으로
   옮겼다. 이 파일 안에 있으면 테스트를 돌릴 수 없기 때문이다.
   → docs/deliverables/08_테스트자동화.md */

/* ------------------------------------------------------------------ */

export default function PrepView({
  list,
  recipes,
  storeName,
}: {
  list: PrepList;
  recipes: Recipe[];
  storeName: string;
}) {
  const keyPrefix = `prep:${list.slug}:`;
  const storageKey = dayKey(keyPrefix, businessDay());
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [scales, setScales] = useState<Record<string, number>>({});
  const [now, setNow] = useState<Date | null>(null);

  const recipeBySlug = useMemo(
    () => new Map(recipes.map((r) => [r.slug, r])),
    [recipes],
  );

  /* ★ 추가 옵션은 부모 카드 안으로 들어간다 (2026-09-09).
     매장마다 하거나 안 하는 일(르방 등)이 목록의 한 칸을 차지하면
     `9/10` 이 영영 안 채워지고, 그러면 진행률이 거짓이 된다.
     → src/lib/types.ts 의 `optionOf` 주석 */
  const tops = useMemo(() => list.tasks.filter((t) => !t.optionOf), [list.tasks]);
  const optionsBy = useMemo(() => {
    const m = new Map<string, PrepTask[]>();
    for (const t of list.tasks) {
      if (!t.optionOf) continue;
      const cur = m.get(t.optionOf);
      if (cur) cur.push(t);
      else m.set(t.optionOf, [t]);
    }
    return m;
  }, [list.tasks]);

  /* 빨간 안내는 **옵션까지 센다.** 진행률과 분모가 다른 것은 일부러다 —
     르방을 쓰는 매장에서 "다 했습니다" 가 거짓이 되면 안 된다. */
  const irreversible = useMemo(
    () => list.tasks.filter((t) => !t.recoverable),
    [list.tasks],
  );
  const irreversibleLeft = irreversible.filter((t) => !done.has(t.id)).length;

  useEffect(() => {
    // 시각 계산은 클라이언트에서만 한다 (서버에서 하면 빌드 시각이 박힌다)
    setNow(new Date());
    // 지난 영업일 키를 지운다. 예전에는 removeItem 호출이 아예 없어서
    // 프렙 체크 기록을 화면에서 지울 방법이 없었다
    pruneDayKeys(keyPrefix, businessDay());
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setDone(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* 사생활 보호 모드 등 — 빈 상태로 시작 */
    }
    log("prep_view", { prepSlug: list.slug });
  }, [storageKey, keyPrefix, list.slug]);

  const toggle = useCallback(
    (task: PrepTask) => {
      setDone((prev) => {
        const next = new Set(prev);
        if (next.has(task.id)) next.delete(task.id);
        else {
          next.add(task.id);
          log("prep_check", {
            prepSlug: list.slug,
            taskId: task.id,
            recoverable: task.recoverable,
          });
        }
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          /* 저장 실패해도 화면은 계속 쓸 수 있게 둔다 */
        }
        return next;
      });
    },
    [storageKey, list.slug],
  );

  const setScale = useCallback(
    (taskId: string, s: number) => {
      setScales((prev) => ({ ...prev, [taskId]: s }));
      log("prep_scale", { prepSlug: list.slug, taskId, scale: s });
    },
    [list.slug],
  );

  // 옵션은 진행률에서 뺀다. `done.size` 를 그대로 쓰면 옵션을 체크한 만큼
  // 분자가 커져서 `10/9` 같은 숫자가 나온다
  const total = tops.length;
  const doneCount = tops.filter((t) => done.has(t.id)).length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[720px] bg-zinc-50 pb-24 dark:bg-zinc-950">
      {/* ---------- 상단 고정 ---------- */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="flex items-center justify-between gap-2">
          <BackButton />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {storeName}
            </p>
            <h1 className="truncate text-lg font-bold">{list.name}</h1>
          </div>
          <p className="shrink-0 text-sm font-semibold tabular-nums text-orange-600 dark:text-orange-400">
            {doneCount}/{total}
          </p>
        </div>
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="진행률"
        >
          <div
            className="h-full rounded-full bg-orange-500 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </header>

      {/* ---------- 되돌릴 수 없는 것 요약 ---------- */}
      {irreversible.length > 0 && (
        <div className="px-4 pt-4">
          <div
            className={[
              "rounded-2xl border-2 px-4 py-3.5",
              irreversibleLeft > 0
                ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40"
                : "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40",
            ].join(" ")}
          >
            {irreversibleLeft > 0 ? (
              <>
                <p className="text-[15px] font-bold text-red-800 dark:text-red-200">
                  까먹지 말고 해야 할 것 {irreversibleLeft}개
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-red-700/90 dark:text-red-200/80">
                  빨간 테두리로 표시된 것들입니다. 오늘 안 하면 내일 아침에
                  되돌릴 방법이 없습니다.
                </p>
              </>
            ) : (
              <p className="text-[15px] font-bold text-emerald-800 dark:text-emerald-200">
                오늘 꼭 해야 할 건 다 했습니다
              </p>
            )}
          </div>
        </div>
      )}

      {/* 목록 설명은 요약 블록과 무관하게 항상 보여야 한다.
          주기 점검처럼 되돌릴 수 없는 항목이 없는 목록에서도 필요하다. */}
      {list.note && (
        <p className="px-5 pt-3 text-[12px] text-zinc-500 dark:text-zinc-400">
          {list.note}
        </p>
      )}

      {/* ---------- 항목 ---------- */}
      <ul className="flex flex-col gap-3 px-4 pt-4">
        {tops.map((task) => {
          const checked = done.has(task.id);
          const recipe = task.recipeSlug
            ? recipeBySlug.get(task.recipeSlug)
            : undefined;
          const scale = scales[task.id] ?? 1;
          // 한 번만 계산한다. 예전엔 라벨용·주말표시용으로 두 번 불렀다
          const arrival =
            now && task.leadTimeDays !== null
              ? arrivesIn(task.leadTimeDays, now)
              : null;

          return (
            <li
              key={task.id}
              className={[
                "overflow-hidden rounded-2xl border-2 bg-white transition-colors dark:bg-zinc-900",
                checked
                  ? "border-zinc-200 opacity-55 dark:border-zinc-800"
                  : task.recoverable
                    ? "border-zinc-200 dark:border-zinc-800"
                    : "border-red-300 dark:border-red-900",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => toggle(task)}
                aria-pressed={checked}
                className="flex w-full items-start gap-3 p-4 text-left active:bg-zinc-50 dark:active:bg-zinc-800"
              >
                <span
                  aria-hidden
                  className={[
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-white transition-colors",
                    checked
                      ? "border-orange-500 bg-orange-500"
                      : "border-zinc-300 dark:border-zinc-600",
                  ].join(" ")}
                >
                  {checked && (
                    <svg
                      viewBox="0 0 20 20"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 10.5 8 14.5 16 6" />
                    </svg>
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  {/* 뱃지 줄 */}
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    {task.critical && (
                      // 위생·안전 항목. 체크리스트·교육 모드와 같은 표시를 쓴다
                      <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                        꼭 지키기
                      </span>
                    )}
                    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      {triggerLabel(task.trigger)}
                    </span>
                    {task.quantityVaries && (
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        수량 매일 다름
                      </span>
                    )}
                  </div>

                  <h3
                    className={[
                      "text-[16px] font-bold leading-snug",
                      checked ? "line-through" : "",
                    ].join(" ")}
                  >
                    {task.title}
                  </h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                    {task.desc}
                  </p>

                  {/* 언제 쓸 수 있나 — 종이가 못 하는 계산 */}
                  {/* 이 줄이 제품의 핵심이다. 서버에서도 일단 그려두고(시간 없이),
                      클라이언트에서 정확한 시각으로 바꾼다. 안 그러면 첫 화면에
                      제일 중요한 문장이 비어 보인다. */}
                  {task.leadTimeHours !== null && (
                    <p className="mt-2 rounded-lg bg-zinc-100 px-2.5 py-2 text-[13px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      지금 걸면 →{" "}
                      <b>
                        {now
                          ? `${readyAt(task.leadTimeHours, now)}부터`
                          : `${task.leadTimeHours}시간 뒤부터`}
                      </b>{" "}
                      사용 가능{" "}
                      {now && (
                        <span className="font-normal text-zinc-500">
                          ({task.leadTimeHours}시간)
                        </span>
                      )}
                    </p>
                  )}
                  {task.leadTimeDays !== null && (
                    <p className="mt-2 rounded-lg bg-zinc-100 px-2.5 py-2 text-[13px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      오늘 주문 →{" "}
                      <b>
                        {arrival
                          ? arrival.label
                          : `영업일 ${task.leadTimeDays}일 뒤`}
                      </b>{" "}
                      도착
                      {arrival?.overWeekend && (
                        <span className="ml-1 font-normal text-zinc-500">
                          (주말 배송 없음)
                        </span>
                      )}
                    </p>
                  )}

                  {/* 안 하면 생기는 일 */}
                  <p
                    className={[
                      "mt-2 text-[13px] leading-relaxed",
                      task.recoverable
                        ? "text-zinc-500 dark:text-zinc-400"
                        : "font-semibold text-red-700 dark:text-red-300",
                    ].join(" ")}
                  >
                    안 하면 — {task.consequence}
                  </p>
                </div>
              </button>

              {/* 사진·영상 — 판단이 갈리는 항목일수록 이쪽이 본체다 */}
              <div className="px-4 pb-4 pl-[3.75rem]">
                <MediaSlot base={task.id} />
              </div>

              {/* 배수 계산기 (버튼 밖에 둔다) */}
              {recipe && (
                <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                  <span className="mb-1.5 block text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">
                    오늘 몇 배?
                  </span>
                  <div className="grid grid-cols-5 gap-1.5">
                    {SCALES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setScale(task.id, s)}
                        className={[
                          "rounded-lg border py-2 text-center text-[13px] font-bold tabular-nums transition-colors",
                          scale === s
                            ? "border-orange-500 bg-orange-500 text-white"
                            : "border-zinc-300 bg-white text-zinc-600 active:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
                        ].join(" ")}
                      >
                        {s}배
                      </button>
                    ))}
                  </div>

                  <p className="mt-2.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                    <Link
                      href={`/r/${recipe.slug}`}
                      className="font-semibold text-zinc-700 underline underline-offset-2 dark:text-zinc-200"
                    >
                      {recipe.name}
                    </Link>{" "}
                    · 1배합 = {recipe.yield.amount}
                    {recipe.yield.unit} →{" "}
                    <b className="text-orange-600 dark:text-orange-400">
                      {scaled(recipe.yield.amount, scale)}
                      {recipe.yield.unit}
                    </b>
                  </p>

                  <ul className="mt-1.5 flex flex-col gap-0.5">
                    {recipe.ingredients.map((ing) => (
                      <li
                        key={ing.name}
                        className="flex items-baseline justify-between gap-3 text-[14px]"
                      >
                        <span className="min-w-0 text-zinc-600 dark:text-zinc-300">
                          {ing.name}
                          {ing.note && (
                            // 배합률(60%, 6%)은 배수를 곱해도 그대로다. 그래서 기준이 된다.
                            <span className="ml-1.5 text-[11px] text-zinc-400">
                              {ing.note}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-bold tabular-nums">
                          {scaled(ing.amount, scale)}
                          {ing.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ---------- 추가 옵션 ---------- *
                  매장에 따라 하거나 안 하는 일. 목록의 한 칸을 차지하지 않는다.
                  진행률에서는 빠지지만 되돌릴 수 없는 것이면 위의 빨간 안내에는
                  그대로 센다. → src/lib/types.ts 의 `optionOf` */}
              {(optionsBy.get(task.id) ?? []).length > 0 && (
                <div className="border-t border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/60">
                  <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">
                    추가 옵션
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400">
                    매장에 따라 안 하기도 합니다. <b>하는 매장만</b> 체크하세요 —
                    위의 진행률에는 안 들어갑니다.
                  </p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {(optionsBy.get(task.id) ?? []).map((opt) => {
                      const optDone = done.has(opt.id);
                      return (
                        <li key={opt.id}>
                          <button
                            type="button"
                            onClick={() => toggle(opt)}
                            aria-pressed={optDone}
                            className={[
                              "flex w-full items-start gap-2.5 rounded-xl border-2 bg-white p-3 text-left active:bg-zinc-100 dark:bg-zinc-900 dark:active:bg-zinc-800",
                              optDone
                                ? "border-zinc-200 opacity-55 dark:border-zinc-800"
                                : opt.recoverable
                                  ? "border-zinc-200 dark:border-zinc-800"
                                  : "border-red-300 dark:border-red-900",
                            ].join(" ")}
                          >
                            <span
                              aria-hidden
                              className={[
                                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-white",
                                optDone
                                  ? "border-orange-500 bg-orange-500"
                                  : "border-zinc-300 dark:border-zinc-600",
                              ].join(" ")}
                            >
                              {optDone && (
                                <svg
                                  viewBox="0 0 20 20"
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M4 10.5 8 14.5 16 6" />
                                </svg>
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="mb-1 flex flex-wrap items-center gap-1.5">
                                {opt.critical && (
                                  <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                                    꼭 지키기
                                  </span>
                                )}
                                <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                  {triggerLabel(opt.trigger)}
                                </span>
                              </span>
                              <span
                                className={[
                                  "block text-[14px] font-bold leading-snug",
                                  optDone ? "line-through" : "",
                                ].join(" ")}
                              >
                                {opt.title}
                              </span>
                              <span className="mt-0.5 block text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                                {opt.desc}
                              </span>
                              {opt.leadTimeHours !== null && (
                                <span className="mt-1.5 block rounded-lg bg-zinc-100 px-2 py-1.5 text-[12.5px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                                  지금 걸면 →{" "}
                                  <b>
                                    {now
                                      ? `${readyAt(opt.leadTimeHours, now)}부터`
                                      : `${opt.leadTimeHours}시간 뒤부터`}
                                  </b>{" "}
                                  사용 가능
                                </span>
                              )}
                              <span
                                className={[
                                  "mt-1.5 block text-[12.5px] leading-relaxed",
                                  opt.recoverable
                                    ? "text-zinc-500 dark:text-zinc-400"
                                    : "font-semibold text-red-700 dark:text-red-300",
                                ].join(" ")}
                              >
                                안 하면 — {opt.consequence}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="px-4 pt-8">
        <Link
          href="/"
          className="block w-full rounded-xl border border-zinc-300 py-3 text-center text-[13px] font-medium text-zinc-500 active:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:active:bg-zinc-800"
        >
          처음으로
        </Link>
        <p className="mt-3 text-center text-[11px] leading-relaxed text-zinc-400">
          체크 상태는 이 기기에만 저장되며 <b>영업일이 바뀌면 초기화됩니다</b>.
          하루의 경계는 <b>새벽 4시</b>입니다.
        </p>
      </div>
    </div>
  );
}
