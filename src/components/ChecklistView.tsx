"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import BackButton from "@/components/BackButton";
import type { Position, Step } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* 저장은 전부 localStorage. 회원가입이 없는 게 이 MVP의 핵심이라서,     */
/* 체크 상태를 서버에 보관하지 않는다. 날짜가 바뀌면 자동으로 초기화된다. */
/* ------------------------------------------------------------------ */

function todayKey(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

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
    /* 로깅 실패가 체크리스트 사용을 막으면 안 된다 */
  }
}

function youtubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/,
  );
  return m ? m[1] : null;
}

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

  const storageKey = `sop:${position.shareSlug}:${todayKey()}`;

  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);
  const [asked, setAsked] = useState<string | null>(null);

  // 저장된 체크 상태 복원 + 조회 1회 기록
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setDone(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* 사파리 사생활 보호 모드 등 — 그냥 빈 상태로 시작 */
    }
    setHydrated(true);
    log("view", { positionSlug: position.shareSlug });
  }, [storageKey, position.shareSlug]);

  const toggle = useCallback(
    (taskId: string) => {
      setDone((prev) => {
        const next = new Set(prev);
        if (next.has(taskId)) next.delete(taskId);
        else next.add(taskId);
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          /* 저장 실패해도 화면에서는 계속 쓸 수 있게 둔다 */
        }
        return next;
      });
    },
    [storageKey],
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
              const ytId = task.videoUrl ? youtubeId(task.videoUrl) : null;

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

                  {/* 사진·영상은 버튼 밖에 둔다 (버튼 안에 iframe을 넣지 않기 위해) */}
                  {(task.goodImage || ytId) && (
                    <div className="px-4 pb-4 pl-[3.75rem]">
                      {task.goodImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={task.goodImage}
                          alt={task.title}
                          loading="lazy"
                          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800"
                        />
                      )}
                      {ytId && (
                        <div className="mt-2 aspect-video w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                          <iframe
                            src={`https://www.youtube.com/embed/${ytId}`}
                            title={`${task.title} 영상 가이드`}
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
          </ul>
        </section>
      ))}

      {/* ---------- 다 끝냈을 때: 가설 검증용 한 줄 설문 ---------- */}
      {finished && (
        <section className="mx-4 mt-8 rounded-2xl border border-orange-200 bg-orange-50 p-5 dark:border-orange-900/60 dark:bg-orange-950/40">
          <p className="text-base font-bold text-orange-900 dark:text-orange-100">
            오늘 하루 수고하셨습니다
          </p>
          {asked === null ? (
            <>
              <p className="mt-1 text-[13px] text-orange-900/80 dark:text-orange-100/80">
                마지막으로 하나만 알려주세요. 오늘 선배에게 몇 번 물어보셨나요?
              </p>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {["0번", "1~2번", "3~5번", "6번 이상"].map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setAsked(label);
                      log("survey", {
                        positionSlug: position.shareSlug,
                        askedSenior: label,
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
              답변 감사합니다. 내일 다시 접속하면 체크리스트가 초기화됩니다.
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
          체크 상태는 이 휴대폰에만 저장되며 날짜가 바뀌면 초기화됩니다.
        </p>
      </div>
    </div>
  );
}
