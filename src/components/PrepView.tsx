"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import MediaSlot from "@/components/MediaSlot";
import { SaveFailed, useSaveState } from "@/components/ui";
import { SCALES, scaled } from "@/lib/scale";
import { businessDay, dayKey, pruneDayKeys } from "@/lib/businessDay";
import { arrivesIn, readyAt, triggerLabel } from "@/lib/leadTime";
import {
  loadCycleDone,
  loadCycleEvery,
  saveCycleDone,
  saveCycleEvery,
  setDone as setCycleDay,
  setEvery as setCycleEvery,
  sortByUrgency,
  statusLine,
  toggleDone as toggleCycleDone,
  type CycleDone,
  type CycleEvery,
} from "@/lib/cycleDone";
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

/* ------------------------------------------------------------------ *
 * 배수 계산기
 *
 * 부모 카드와 「추가 옵션」이 **같은 것을 쓴다** (2026-09-09).
 * 옵션 안에서도 레시피를 바로 보고 만들 수 있어야 한다는 요청이라
 * 같은 마크업을 두 벌 두면 한쪽만 고치게 된다.
 * ------------------------------------------------------------------ */
/**
 * 카드의 누르는 부분.
 *
 * **묶음 머리**(`header`)는 누를 수 없다. `기계 · 설비 점검` 은 할 일이 아니라
 * 이름표이고, 누를 수 있게 두면 그것도 하나의 할 일로 읽힌다.
 * 아무 일도 안 하는 버튼을 두면 스크린리더도 "버튼"이라고 읽는다.
 */
function CardHead({
  header,
  checked,
  onToggle,
  children,
}: {
  header: boolean;
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  if (header) {
    return <div className="flex w-full items-start gap-3 p-4 text-left">{children}</div>;
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className="flex w-full items-start gap-3 p-4 text-left active:bg-zinc-50 dark:active:bg-zinc-800"
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */

function Scaler({
  recipe,
  scale,
  onPick,
  compact,
}: {
  recipe: Recipe;
  scale: number;
  onPick: (s: number) => void;
  /** 옵션 안에서는 한 급 작게 */
  compact?: boolean;
}) {
  return (
    <div
      className={[
        "border-t bg-zinc-50 dark:bg-zinc-950/60",
        compact
          ? "mt-2 rounded-xl border border-zinc-200 px-3 py-2.5 dark:border-zinc-800"
          : "border-zinc-200 px-4 py-3 dark:border-zinc-800",
      ].join(" ")}
    >
      <span className="mb-1.5 block text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">
        오늘 몇 배?
      </span>
      <div className="grid grid-cols-5 gap-1.5">
        {SCALES.map((sc) => (
          <button
            key={sc}
            type="button"
            onClick={() => onPick(sc)}
            className={[
              "rounded-lg border text-center font-bold tabular-nums transition-colors",
              compact ? "py-1.5 text-[12px]" : "py-2 text-[13px]",
              scale === sc
                ? "border-orange-500 bg-orange-500 text-white"
                : "border-zinc-300 bg-white text-zinc-600 active:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
            ].join(" ")}
          >
            {sc}배
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
            className={[
              "flex items-baseline justify-between gap-3",
              compact ? "text-[13px]" : "text-[14px]",
            ].join(" ")}
          >
            <span className="min-w-0 text-zinc-600 dark:text-zinc-300">
              {ing.name}
              {ing.note && (
                // 배합률(60%, 6%)은 배수를 곱해도 그대로다. 그래서 기준이 된다.
                <span className="ml-1.5 text-[11px] text-zinc-400">{ing.note}</span>
              )}
            </span>
            <span className="shrink-0 font-bold tabular-nums">
              {scaled(ing.amount, scale)}
              {ing.unit}
            </span>
          </li>
        ))}
      </ul>

      <RecipeSteps recipe={recipe} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 만드는 순서 — 프렙 안에서 바로 본다
 *
 * ★ 왜 여기 있나 (사장님 요청 2026-09-10: "프렙이랑 레시피랑 같이 있어야 하는데")
 *
 *   전에는 프렙에 **재료와 배수만** 있었다. 만드는 순서를 보려면
 *   `/r/{slug}` 로 나가야 했고, 그 화면은 **매장 PIN 이 걸려 있다.**
 *   주방에서 크림폼을 올리다 말고 화면을 나갔다가, 번호를 넣고,
 *   다시 프렙으로 돌아와 체크해야 했다. 젖은 손으로 네 번이다.
 *
 *   재료와 순서는 한 몸이다. 나눠 놓을 이유가 없었다.
 *
 * ★ 접어 두는 이유: 오후 프렙에만 레시피 붙은 항목이 여덟이다.
 *   전부 펼쳐 두면 스크롤이 길어져 정작 목록을 못 훑는다.
 *   한 번 누르는 것과 **화면을 옮기는 것**은 다르다 — 번호도 안 묻고
 *   보던 자리를 잃지도 않는다.
 *
 * 사진 자리(`MediaSlot base={step.id}`)는 레시피 화면과 **같은 id** 를 쓴다.
 * 한 번 찍어 넣으면 두 화면에 같이 뜬다.
 * ------------------------------------------------------------------ */
function RecipeSteps({ recipe }: { recipe: Recipe }) {
  const steps = recipe.sections.flatMap((sec) => sec.steps);
  if (steps.length === 0) return null;
  const note = recipe.sections.map((sec) => sec.note).filter(Boolean)[0];

  return (
    <details className="group mt-3 border-t border-zinc-200 pt-2.5 dark:border-zinc-800">
      <summary className="cursor-pointer list-none text-[12.5px] font-semibold text-zinc-600 marker:content-none dark:text-zinc-300">
        <span className="inline-block transition-transform group-open:rotate-90">›</span>{" "}
        만드는 순서 {steps.length}단계
        {note && (
          <span className="ml-1.5 font-normal text-zinc-400">{note}</span>
        )}
      </summary>

      <ol className="mt-2 flex flex-col gap-2">
        {steps.map((step, i) => (
          <li
            key={step.id}
            className={[
              "overflow-hidden rounded-xl border bg-white dark:bg-zinc-900",
              step.critical
                ? "border-red-200 dark:border-red-900/60"
                : "border-zinc-200 dark:border-zinc-800",
            ].join(" ")}
          >
            <div className="flex items-start gap-2.5 p-3">
              <span
                aria-hidden
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[12px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                {step.critical && (
                  <span className="mb-1 inline-block rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                    꼭 지키기
                  </span>
                )}
                <h4 className="text-[14px] font-semibold leading-snug">
                  {step.title}
                </h4>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                  {step.desc}
                </p>
                {step.tip && (
                  <p className="mt-1.5 rounded-lg bg-zinc-100 px-2 py-1.5 text-[12px] leading-relaxed text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    <span className="font-semibold">선배 한마디 </span>
                    {step.tip}
                  </p>
                )}
              </div>
            </div>
            <div className="px-3 pb-3 pl-[2.75rem]">
              <MediaSlot base={step.id} />
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

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
  const today = businessDay();
  const storageKey = dayKey(keyPrefix, today);
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [scales, setScales] = useState<Record<string, number>>({});
  const [now, setNow] = useState<Date | null>(null);
  /* ★ 주기 점검은 **그날 체크가 아니라 마지막으로 한 날**을 남긴다.
     예전에는 `prep:cycle:{영업일}` 이라서 다음 날 지워졌고, 그러면
     `4개월마다` 를 앱이 세지 못했다. → src/lib/cycleDone.ts */
  const [cycleDone, setCycleDone] = useState<CycleDone>({});
  /* 주기는 **매장이 정한다.** 시드에는 없다 — 제빙기를 매일 닦는 매장에
     `1개월마다` 를 띄우면 처음부터 틀린 말이다 (사장님 지적 2026-09-08) */
  const [cycleEvery, setCycleEveryState] = useState<CycleEvery>({});
  /* ★ 주기 기록은 **오래 남아야 하는 값**이라 저장 실패를 알린다.
     그날 체크(`prep:{slug}:{영업일}`)는 일부러 조용하다 — 잃어도 그날 일은
     계속해야 한다. 여기는 다르다: 보건증을 언제 갱신했는지가 사라지면
     그 사실을 되찾을 방법이 없다. → 21_화면명세 §7-① */
  const save = useSaveState();

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

  /* ★ 「묶음 머리」 — 자기 안에 **반드시 해야 하는** 항목을 담은 카드.
     주기 점검의 `기계 · 설비 점검` 처럼 그 자체가 할 일이 아니라 이름표다.
     세면 같은 일을 두 번 세게 되므로 체크도 없고 분모에도 안 들어간다.
     반대로 `바 부재료 점검 · 제조` 는 안에 든 것이 전부 optional 이라
     그 카드 자체가 할 일(점검했다)이다 → 그건 센다. */
  const isHeader = useCallback(
    (id: string) => {
      const kids = optionsBy.get(id) ?? [];
      return kids.length > 0 && kids.some((k) => !k.optional);
    },
    [optionsBy],
  );

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
    setCycleDone(loadCycleDone());
    setCycleEveryState(loadCycleEvery());
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

  /** 이 목록이 주기 점검인가. 주기 항목은 체크 방식이 다르다 */
  const isCycleList = useMemo(
    () => list.tasks.some((t) => t.trigger.type === "cycle"),
    [list.tasks],
  );

  const toggleCycle = useCallback(
    (task: PrepTask) => {
      const next = toggleCycleDone(cycleDone, task.id, businessDay());
      setCycleDone(next);
      save.report(saveCycleDone(next));
      log("prep_check", {
        prepSlug: list.slug,
        taskId: task.id,
        recoverable: task.recoverable,
      });
    },
    [cycleDone, list.slug, save],
  );

  /** 주기 항목인가 */
  const isCycleTask = useCallback(
    (t: PrepTask) => t.trigger.type === "cycle",
    [],
  );
  /** 매장이 정한 주기(일). 안 정했으면 null — 기한을 지어내지 않는다 */
  const everyOf = useCallback(
    (t: PrepTask) => (isCycleTask(t) ? (cycleEvery[t.id] ?? null) : null),
    [cycleEvery, isCycleTask],
  );
  /** 화면에 그대로 쓰는 한 줄 + 빨갛게 할지 */
  const statusOf = useCallback(
    (t: PrepTask) => statusLine(cycleDone, t.id, everyOf(t), today),
    [cycleDone, everyOf, today],
  );

  /* ★ 주기 점검 화면이 답해야 하는 질문은 "오늘 몇 개 체크했나" 가 아니라
     **"지금 해야 할 게 몇 개인가"** 다. 기록이 없는 것도 여기 들어간다 —
     언제 했는지 모르는 것이 가장 위험하다. */
  const cycleItems = useMemo(
    () => list.tasks.filter((t) => t.trigger.type === "cycle" && t.optionOf),
    [list.tasks],
  );
  /* "지금 해야 할 것" = 기록이 없거나 기한이 지난 것.
     주기를 안 정한 항목은 **기한을 판단하지 않는다** — 기록만 있으면 넘어간다 */
  const overdue = cycleItems.filter((t) => statusOf(t).late);

  /** 마지막으로 한 날을 직접 넣는다 (지난 날짜를 채울 때) */
  const putCycleDay = useCallback(
    (id: string, day: string) => {
      const next = setCycleDay(cycleDone, id, day || null);
      setCycleDone(next);
      save.report(saveCycleDone(next));
    },
    [cycleDone, save],
  );

  /** 매장이 정하는 주기(일). 비우면 "안 정함" 이 되고 기한 판단을 멈춘다 */
  const putCycleEvery = useCallback(
    (id: string, raw: string) => {
      const n = raw.trim() === "" ? null : Number(raw);
      const next = setCycleEvery(cycleEvery, id, n);
      setCycleEveryState(next);
      save.report(saveCycleEvery(next));
    },
    [cycleEvery, save],
  );

  const setScale = useCallback(
    (taskId: string, s: number) => {
      setScales((prev) => ({ ...prev, [taskId]: s }));
      log("prep_scale", { prepSlug: list.slug, taskId, scale: s });
    },
    [list.slug],
  );

  /* 진행률에 세는 것 = 묶음 머리가 아닌 카드 + optional 아닌 자식.
     `done.size` 를 그대로 쓰면 옵션을 체크한 만큼 분자가 커져서
     `10/9` 같은 숫자가 나온다. */
  const counted = useMemo(
    () =>
      list.tasks.filter((t) =>
        t.optionOf ? !t.optional : !isHeader(t.id),
      ),
    [list.tasks, isHeader],
  );
  const total = counted.length;
  /* 주기 목록에서 "오늘 체크한 개수" 는 뜻이 없다 — 4개월 주기를 매일 체크할
     일이 없으니 늘 0/13 이 된다. 그래서 **기한 안에 있는 것**을 센다. */
  const doneCount = isCycleList
    ? counted.filter((t) => !statusOf(t).late).length
    : counted.filter((t) => done.has(t.id)).length;
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

      {save.failed && (
        <div className="px-4 pt-4">
          <SaveFailed
            what="점검 기록"
            retry={() => save.report(saveCycleDone(cycleDone) && saveCycleEvery(cycleEvery))}
          />
        </div>
      )}

      {/* ---------- 주기 목록: 지금 해야 할 것 ---------- *
          "되돌릴 수 없는 것" 안내는 여기서 뜻이 약하다(13개 중 1개).
          이 화면이 답해야 하는 질문은 **지금 해야 할 게 몇 개인가** 다. */}
      {isCycleList && (
        <div className="px-4 pt-4">
          <div
            className={[
              "rounded-2xl border-2 px-4 py-3.5",
              overdue.length > 0
                ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40"
                : "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40",
            ].join(" ")}
          >
            {overdue.length > 0 ? (
              <>
                <p className="text-[15px] font-bold text-red-800 dark:text-red-200">
                  지금 해야 할 것 {overdue.length}개
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-red-700/90 dark:text-red-200/80">
                  기한이 지났거나 <b>언제 했는지 기록이 없는</b> 것들입니다.
                  기록이 없으면 3년 전에 했는지 어제 했는지 알 수 없습니다.
                </p>
              </>
            ) : (
              <p className="text-[15px] font-bold text-emerald-800 dark:text-emerald-200">
                기한 지난 것이 없습니다
              </p>
            )}
          </div>
        </div>
      )}

      {/* ---------- 되돌릴 수 없는 것 요약 ---------- */}
      {!isCycleList && irreversible.length > 0 && (
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
          const header = isHeader(task.id);
          const hasLead =
            task.leadTimeHours !== null || task.leadTimeDays !== null;
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
              <CardHead
                header={header}
                checked={checked}
                onToggle={() => toggle(task)}
              >
                {!header && (
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
                )}

                <div className="min-w-0 flex-1">
                  {/* 뱃지 줄 */}
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    {task.critical && (
                      // 위생·안전 항목. 체크리스트·교육 모드와 같은 표시를 쓴다
                      <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                        꼭 지키기
                      </span>
                    )}
                    {/* 묶음 머리의 주기는 자식마다 달라서 하나로 못 적는다 */}
                    {!header && (
                      <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                        {triggerLabel(task.trigger)}
                      </span>
                    )}
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
                  {/* ★ "안 하면 —" 은 **리드타임이 없는 항목에만** 띄운다.
                      `지금 걸면 → 내일 07:43 부터` 가 이미 같은 말을 하고,
                      `쿠팡으로 메울 수 있습니다` 같은 문장은 안 해도 괜찮다고
                      알려주는 셈이라 해롭다 (사장님 지적 2026-09-08).
                      묶음 머리는 할 일이 아니라 이름표라서 역시 안 띄운다.
                      → src/lib/types.ts 의 `consequence` 주석 */}
                  {!header && !hasLead && task.consequence.trim() !== "" && (
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
                  )}
                </div>
              </CardHead>

              {/* 사진·영상 — 판단이 갈리는 항목일수록 이쪽이 본체다 */}
              <div className="px-4 pb-4 pl-[3.75rem]">
                <MediaSlot base={task.id} />
              </div>

              {/* 배수 계산기 (버튼 밖에 둔다) */}
              {recipe && (
                <Scaler
                  recipe={recipe}
                  scale={scale}
                  onPick={(sc) => setScale(task.id, sc)}
                />
              )}

              {/* ---------- 추가 옵션 ---------- *
                  매장에 따라 하거나 안 하는 일. 목록의 한 칸을 차지하지 않는다.
                  진행률에서는 빠지지만 되돌릴 수 없는 것이면 위의 빨간 안내에는
                  그대로 센다. → src/lib/types.ts 의 `optionOf` */}
              {(optionsBy.get(task.id) ?? []).length > 0 && (
                <div className="border-t border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/60">
                  {/* ★ 같은 자리에 두 가지가 온다.
                      필수 묶음(주기 점검)에 "안 하기도 합니다" 를 쓰면 거짓이다 —
                      보건증·소방은 매장 사정과 무관하게 해야 한다 */}
                  {header ? (
                    <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">
                      이 묶음의 항목 {(optionsBy.get(task.id) ?? []).length}개
                    </p>
                  ) : (
                    <>
                      <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">
                        추가 옵션
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400">
                        매장에 따라 안 하기도 합니다. <b>하는 매장만</b> 체크하세요 —
                        위의 진행률에는 안 들어갑니다.
                      </p>
                    </>
                  )}
                  <ul className="mt-2 flex flex-col gap-2">
                    {(isCycleList
                      ? sortByUrgency(
                          (optionsBy.get(task.id) ?? []).map((t) => ({
                            id: t.id,
                            everyDays: everyOf(t),
                            t,
                          })),
                          cycleDone,
                          today,
                        ).map((x) => x.t)
                      : (optionsBy.get(task.id) ?? [])
                    ).map((opt) => {
                      const optCycle = isCycleTask(opt);
                      const optStatus = optCycle ? statusOf(opt) : null;
                      // 주기 항목의 체크는 "오늘 했다" 다. 그날 체크가 아니라
                      // 마지막으로 한 날을 남긴다
                      const optDone = optCycle
                        ? cycleDone[opt.id] === today
                        : done.has(opt.id);
                      return (
                        <li key={opt.id}>
                          <button
                            type="button"
                            onClick={() =>
                              optCycle ? toggleCycle(opt) : toggle(opt)
                            }
                            aria-pressed={optDone}
                            className={[
                              "flex w-full items-start gap-2.5 rounded-xl border-2 bg-white p-3 text-left active:bg-zinc-100 dark:bg-zinc-900 dark:active:bg-zinc-800",
                              optDone
                                ? "border-zinc-200 opacity-55 dark:border-zinc-800"
                                : optStatus
                                  ? // 주기 항목은 기한이 지났거나 기록이 없으면 빨강
                                    optStatus.late
                                    ? "border-red-300 dark:border-red-900"
                                    : "border-zinc-200 dark:border-zinc-800"
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
                                {/* ★ 주기 항목은 발동 뱃지를 안 그린다.
                                    `1개월마다` 는 매장마다 다르고, 내가 모르는
                                    숫자를 띄우면 사장님이 그걸 믿는다.
                                    주기는 아래 입력칸에서 매장이 정한다 */}
                                {!optCycle && (
                                  <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                    {triggerLabel(opt.trigger)}
                                  </span>
                                )}
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
                              {/* ★ 마지막으로 한 날. 이게 없어서 이 화면이
                                  아무 기능을 못 했다 (2026-09-08 고침) */}
                              {optStatus && (
                                <span
                                  className={[
                                    "mt-1.5 block rounded-lg px-2 py-1.5 text-[12.5px] font-semibold",
                                    optStatus.late
                                      ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
                                      : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
                                  ].join(" ")}
                                >
                                  {optStatus.text}
                                </span>
                              )}

                              {/* 부모 카드와 같은 규칙 — 리드타임이 있으면 안 띄운다 */}
                              {opt.leadTimeHours === null &&
                                opt.leadTimeDays === null &&
                                opt.consequence.trim() !== "" && (
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
                                )}
                            </span>
                          </button>

                          {/* ★ 주기와 마지막 날짜는 **매장이 넣는다** (2026-09-08).
                              시드에 박아두면 제빙기를 매일 닦는 매장에
                              `1개월마다` 라는 틀린 말을 하게 된다.
                              날짜 칸이 있어야 **지난 기록도 채워 넣을 수 있다** */}
                          {optCycle && (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pb-1 pt-2">
                              <label className="flex items-center gap-1.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                                마지막
                                <input
                                  type="date"
                                  value={cycleDone[opt.id] ?? ""}
                                  onChange={(e) => putCycleDay(opt.id, e.target.value)}
                                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-[13px] dark:border-zinc-700 dark:bg-zinc-900"
                                  aria-label={`${opt.title} 마지막으로 한 날`}
                                />
                              </label>
                              <label className="flex items-center gap-1.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                                주기
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  placeholder="미정"
                                  value={cycleEvery[opt.id] ?? ""}
                                  onChange={(e) => putCycleEvery(opt.id, e.target.value)}
                                  className="w-[5.5rem] rounded-lg border border-zinc-300 bg-white px-2 py-1 text-[13px] tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
                                  aria-label={`${opt.title} 주기 (일)`}
                                />
                                일
                              </label>
                            </div>
                          )}

                          {/* ★ 옵션 안에서도 레시피를 바로 보고 만들 수 있어야 한다
                              (사장님 요청 2026-09-09). 부모 카드와 같은 부품을 쓴다 */}
                          {opt.recipeSlug && recipeBySlug.get(opt.recipeSlug) && (
                            <div className="px-3 pb-1">
                              <Scaler
                                recipe={recipeBySlug.get(opt.recipeSlug) as Recipe}
                                scale={scales[opt.id] ?? 1}
                                onPick={(sc) => setScale(opt.id, sc)}
                                compact
                              />
                            </div>
                          )}

                          {/* 옵션에도 사진·영상 자리를 준다. "사진·영상"이 이 제품의
                              핵심 가치 셋 중 하나인데, 옵션으로 내렸다고 빼면
                              크림폼 거품 상태처럼 판단이 갈리는 항목이 글만 남는다 */}
                          <div className="pl-[2.3rem] pt-2">
                            <MediaSlot base={opt.id} />
                          </div>
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
