"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import BackButton from "@/components/BackButton";
import MediaSlot from "@/components/MediaSlot";
import type { Position, Step } from "@/lib/types";
import { businessDay, dayKey, pruneDayKeys } from "@/lib/businessDay";
import { logEvent as log } from "@/lib/metrics";

/* ------------------------------------------------------------------ */
/* 저장은 전부 localStorage. 회원가입이 없는 게 이 MVP의 핵심이라서,     */
/* 체크 상태를 서버에 보관하지 않는다. 영업일이 바뀌면 초기화된다.            */
/* 하루의 경계는 자정이 아니라 새벽 4시다 — 마감조가 자정을 넘겨 일한다.    */
/* → src/lib/businessDay.ts                                                */
/* ------------------------------------------------------------------ */

export default function ChecklistView({
  position,
  storeName,
}: {
  position: Position;
  storeName: string;
}) {
  const allTasks = useMemo<Step[]>(
    () => position.sections.flatMap((s) => s.steps),
    [position],
  );
  const total = allTasks.length;

  const keyPrefix = `sop:${position.shareSlug}:`;
  const storageKey = dayKey(keyPrefix, businessDay());

  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);
  const [asked, setAsked] = useState<string | null>(null);

  // 저장된 체크 상태 복원 + 조회 1회 기록
  useEffect(() => {
    // 지난 영업일 키를 지운다. 화면이 "초기화됩니다"라고 약속해 왔는데
    // 예전에는 새 키를 읽기만 하고 옛 키를 안 지워서 매일 하나씩 쌓였다
    pruneDayKeys(keyPrefix, businessDay());
    try {
      const raw = localStorage.getItem(storageKey);
      /* ★ 없으면 **비운다.** `if (raw)` 로 두면 영업일이 바뀌었을 때
         어제 체크가 그대로 남는다 — 이 effect 는 `storageKey` 가 바뀌면
         다시 도는데, 새 키에 값이 없으면 아무것도 안 하고 지나갔다.
         태블릿을 켜둔 채 새벽 4시를 넘기면 그 다음 토글이
         **어제 체크를 오늘 키에 통째로 써 넣는다.** (2026-09-10 점검에서 발견) */
      setDone(raw ? new Set(JSON.parse(raw) as string[]) : new Set());
    } catch {
      /* 사파리 사생활 보호 모드 등 — 그냥 빈 상태로 시작 */
    }
    setHydrated(true);
    log("체크리스트_열기", { positionSlug: position.shareSlug });
  }, [storageKey, keyPrefix, position.shareSlug]);

  /**
   * ★ 체크 한 건도 지표로 남긴다.
   *
   * 지금까지는 화면을 열었다(`체크리스트_열기`)와 끝나고 물었다(`설문_응답`)만 있어서,
   * **"신입이 항목을 실제로 하나씩 짚어 갔는가 / 어디서 멈췄는가"** 를 셀
   * 경로가 0건이었다.
   *
   * 켤 때만 남긴다 — 끄는 것은 오조작 정정이 대부분이다.
   * `critical` 을 같이 실어서 "위생·안전 항목을 실제로 체크했는가" 를 본다.
   */
  const toggle = useCallback(
    (taskId: string) => {
      /* ★ 저장과 로깅은 `setDone` 의 updater **밖**에서 한다.
         React 는 개발 모드(Strict Mode)에서 updater 를 두 번 부른다. 안에 넣으면
         한 번 눌렀는데 `check` 이벤트가 두 건 쌓인다 — 실제로 그렇게 찍혀서
         고쳤다(2026-09-10 브라우저 확인). 부수효과를 updater 에 넣지 않는다.
         `PrepView` 의 `toggleCycle` 도 같은 모양이다. */
      const next = new Set(done);
      const turningOn = !next.has(taskId);
      if (turningOn) next.add(taskId);
      else next.delete(taskId);

      setDone(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        /* 저장 실패해도 화면에서는 계속 쓸 수 있게 둔다 */
      }

      if (turningOn) {
        log("체크", {
          positionSlug: position.shareSlug,
          taskId,
          critical: allTasks.find((t) => t.id === taskId)?.critical ?? false,
          // 몇 개째인지. 중도 이탈 지점을 보려면 필요하다
          doneCount: next.size,
          total,
        });
      }
    },
    [done, storageKey, allTasks, position.shareSlug, total],
  );

  const reset = useCallback(() => {
    setDone(new Set());
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* noop */
    }
  }, [storageKey]);

  const doneCount = done.size;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const finished = hydrated && doneCount === total && total > 0;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[560px] bg-zinc-50 pb-24 dark:bg-zinc-950">
      {/* ---------- 진행 상황 (스크롤해도 상단 고정) ---------- */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="flex items-center justify-between gap-2">
          <BackButton />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {storeName}
            </p>
            <h1 className="truncate text-lg font-bold">
              {position.name}
              <span className="ml-1.5 text-sm font-normal text-zinc-500 dark:text-zinc-400">
                {position.subtitle}
              </span>
            </h1>
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

      {/* ---------- 안내 문구 ---------- */}
      <div className="px-4 pt-4">
        <p className="rounded-xl bg-orange-50 px-3.5 py-3 text-[13px] leading-relaxed text-orange-900 dark:bg-orange-950/40 dark:text-orange-100">
          {position.summary}
        </p>
      </div>

      {/* ---------- 체크리스트 ---------- */}
      {position.sections.map((section) => (
        <section key={section.id} className="px-4 pt-6">
          <div className="mb-2 flex items-baseline gap-2">
            <h2 className="text-[15px] font-bold">{section.title}</h2>
            {section.note && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {section.note}
              </span>
            )}
          </div>

          <ul className="flex flex-col gap-2">
            {section.steps.map((task) => {
              const checked = done.has(task.id);

              return (
                <li
                  key={task.id}
                  className={[
                    "overflow-hidden rounded-2xl border bg-white transition-colors dark:bg-zinc-900",
                    checked
                      ? "border-zinc-200 opacity-55 dark:border-zinc-800"
                      : task.critical
                        ? "border-red-200 dark:border-red-900/60"
                        : "border-zinc-200 dark:border-zinc-800",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => toggle(task.id)}
                    aria-pressed={checked}
                    className="flex w-full items-start gap-3 p-4 text-left active:bg-zinc-50 dark:active:bg-zinc-800"
                  >
                    {/* 체크박스 — 장갑 낀 손도 누르기 쉽게 크게 */}
                    <span
                      aria-hidden
                      className={[
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-white transition-colors",
                        checked
                          ? "border-orange-500 bg-orange-500"
                          : "border-zinc-300 dark:border-zinc-600",
                      ].join(" ")}
                    >
                      {checked && (
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

                    <div className="min-w-0 flex-1">
                      {task.critical && !checked && (
                        <span className="mb-1 inline-block rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                          꼭 지키기
                        </span>
                      )}
                      <h3
                        className={[
                          "text-[15px] font-semibold leading-snug",
                          checked ? "line-through" : "",
                        ].join(" ")}
                      >
                        {task.title}
                      </h3>
                      <p className="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                        {task.desc}
                      </p>
                      {task.tip && (
                        <p className="mt-2 rounded-lg bg-zinc-100 px-2.5 py-2 text-[12px] leading-relaxed text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          <span className="font-semibold">선배 한마디 </span>
                          {task.tip}
                        </p>
                      )}
                    </div>
                  </button>

                  {/* 사진·영상은 버튼 밖에 둔다 (버튼 안에 미디어를 넣지 않기 위해) */}
                  <div className="px-4 pb-4 pl-[3.75rem]">
                    <MediaSlot base={task.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* ---------- 하루 끝 설문 (가설 검증용) ----------
           ★ 예전에는 `finished`(전 항목 체크)에서만 띄웠다. 그래서
             **중도 이탈자는 설문이 아예 발생하지 않았고**, `askedSenior`
             표본이 완주자로 치우쳤다.

             그런데 이 질문은 "오늘 선배에게 몇 번 물었나" 다 — **체크리스트
             완주와 무관한 하루 끝 질문**이다. 게다가 그날 해당 없는 항목이
             있으면 100%가 될 수 없다. 완주에 매달아 둔 것이 설계 실수였다.

             그래서 **하나라도 체크했으면** 보여준다. 완주 여부는 `finished`
             로 페이로드에 실어서 분석할 때 나눌 수 있게 한다. */}
      {hydrated && doneCount > 0 && (
        <section className="mx-4 mt-8 rounded-2xl border border-orange-200 bg-orange-50 p-5 dark:border-orange-900/60 dark:bg-orange-950/40">
          <p className="text-base font-bold text-orange-900 dark:text-orange-100">
            {finished ? "오늘 하루 수고하셨습니다" : "일 마치기 전에"}
          </p>
          {asked === null ? (
            <>
              <p className="mt-1 text-[13px] text-orange-900/80 dark:text-orange-100/80">
                하나만 알려주세요. 오늘 선배에게 몇 번 물어보셨나요?
              </p>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {["0번", "1~2번", "3~5번", "6번 이상"].map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setAsked(label);
                      log("설문_응답", {
                        positionSlug: position.shareSlug,
                        askedSenior: label,
                        // ★ 완주자와 이탈자를 구분할 수 있게 같이 남긴다
                        finished,
                        doneCount,
                        total,
                      });
                    }}
                    className="rounded-xl border border-orange-300 bg-white py-2.5 text-[13px] font-semibold text-orange-800 active:bg-orange-100 dark:border-orange-800 dark:bg-zinc-900 dark:text-orange-200"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-1 text-[13px] text-orange-900/80 dark:text-orange-100/80">
              답변 감사합니다. 다음 영업일에 다시 열면 체크리스트가 초기화됩니다.
            </p>
          )}
        </section>
      )}

      <div className="px-4 pt-8">
        <button
          type="button"
          onClick={reset}
          className="w-full rounded-xl border border-zinc-300 py-3 text-[13px] font-medium text-zinc-500 active:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:active:bg-zinc-800"
        >
          체크 전부 지우기
        </button>
        <p className="mt-3 text-center text-[11px] leading-relaxed text-zinc-400">
          체크 상태는 이 휴대폰에만 저장되며 <b>영업일이 바뀌면 초기화됩니다</b>.
          하루의 경계는 자정이 아니라 <b>새벽 4시</b>라서, 마감조가 자정을 넘겨
          일해도 체크가 사라지지 않습니다.
        </p>
      </div>
    </div>
  );
}
