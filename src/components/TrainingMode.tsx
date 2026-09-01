"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import BackButton from "@/components/BackButton";
import type { Position, Step } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* 매장 공용 태블릿에서 첫날 교육용으로 한 항목씩 넘겨 보는 화면.        */
/*                                                                     */
/* 체크리스트 화면(/p/…)과 저장 방식이 다르다. 공용 기기라서            */
/* localStorage에 남기면 앞사람 진도가 다음 사람에게 그대로 보인다.      */
/* 그래서 여기서는 sessionStorage에 "이번 교육 1회분"만 저장하고,        */
/* [시작하기]를 누를 때마다 새 세션으로 초기화한다.                      */
/* ------------------------------------------------------------------ */

type FlatTask = Step & { sectionTitle: string };

type RunState = {
  runId: string;
  idx: number;
  startedAt: number;
  confirmed: string[];
};

function newRunId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function log(event: string, payload: Record<string, unknown>) {
  try {
    void fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, ...payload }),
      keepalive: true,
    });
  } catch {
    /* 로깅 실패가 교육을 막으면 안 된다 */
  }
}

function youtubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/,
  );
  return m ? m[1] : null;
}

/* ------------------------------------------------------------------ */

export default function TrainingMode({
  position,
  storeName,
}: {
  position: Position;
  storeName: string;
}) {
  const tasks = useMemo<FlatTask[]>(
    () =>
      position.sections.flatMap((s) =>
        s.steps.map((t) => ({ ...t, sectionTitle: s.title })),
      ),
    [position],
  );
  const total = tasks.length;
  const estimatedMin = Math.max(5, Math.round(total * 0.7));

  const storageKey = `sop:run:${position.shareSlug}`;

  const [run, setRun] = useState<RunState | null>(null);
  const [finished, setFinished] = useState(false);
  const [asked, setAsked] = useState<string | null>(null);

  // 새로고침으로 진행 중인 교육이 날아가지 않게 복원한다
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setRun(JSON.parse(raw) as RunState);
    } catch {
      /* noop */
    }
  }, [storageKey]);

  const save = useCallback(
    (next: RunState | null) => {
      setRun(next);
      try {
        if (next) sessionStorage.setItem(storageKey, JSON.stringify(next));
        else sessionStorage.removeItem(storageKey);
      } catch {
        /* noop */
      }
    },
    [storageKey],
  );

  const start = useCallback(() => {
    const fresh: RunState = {
      runId: newRunId(),
      idx: 0,
      startedAt: Date.now(),
      confirmed: [],
    };
    setFinished(false);
    setAsked(null);
    save(fresh);
    log("training_start", {
      positionSlug: position.shareSlug,
      runId: fresh.runId,
      totalTasks: total,
    });
  }, [save, position.shareSlug, total]);

  const task = run ? tasks[run.idx] : null;
  const needsConfirm = task?.critical === true;
  const isConfirmed = task ? (run?.confirmed ?? []).includes(task.id) : false;
  const canGoNext = !needsConfirm || isConfirmed;

  const confirm = useCallback(() => {
    if (!run || !task) return;
    if (run.confirmed.includes(task.id)) return;
    save({ ...run, confirmed: [...run.confirmed, task.id] });
    log("critical_confirm", {
      positionSlug: position.shareSlug,
      runId: run.runId,
      taskId: task.id,
    });
  }, [run, task, save, position.shareSlug]);

  const go = useCallback(
    (delta: number) => {
      if (!run) return;
      const next = run.idx + delta;
      if (next < 0) return;

      if (next >= total) {
        const durationSec = Math.round((Date.now() - run.startedAt) / 1000);
        log("training_complete", {
          positionSlug: position.shareSlug,
          runId: run.runId,
          durationSec,
          confirmedCount: run.confirmed.length,
        });
        setFinished(true);
        save(null);
        return;
      }
      save({ ...run, idx: next });
    },
    [run, total, save, position.shareSlug],
  );

  // 태블릿에 키보드나 리모컨을 붙여 쓰는 경우 대비
  useEffect(() => {
    if (!run) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" && canGoNext) go(1);
      if (e.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, go, canGoNext]);

  /* ---------------- 시작 화면 ---------------- */
  if (!run && !finished) {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-8 text-center dark:bg-zinc-950">
        <div className="absolute left-5 top-5">
          <BackButton />
        </div>
        <p className="text-base text-zinc-500 dark:text-zinc-400">{storeName}</p>
        <h1 className="mt-2 text-4xl font-bold lg:text-5xl">{position.name}</h1>
        <p className="mt-2 text-xl text-zinc-500 dark:text-zinc-400">
          {position.subtitle}
        </p>

        <p className="mt-8 max-w-xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
          {position.summary}
        </p>

        <p className="mt-6 text-base text-zinc-500 dark:text-zinc-400">
          총 {total}개 항목 · 약 {estimatedMin}분
        </p>

        <button
          type="button"
          onClick={start}
          className="mt-10 rounded-2xl bg-orange-500 px-16 py-6 text-2xl font-bold text-white shadow-lg active:bg-orange-600"
        >
          시작하기
        </button>

        <p className="mt-6 text-sm text-zinc-400">
          다 보고 나면 처음 화면으로 돌아갑니다. 다음 사람은 여기서 다시
          시작하면 됩니다.
        </p>
      </div>
    );
  }

  /* ---------------- 끝 화면 ---------------- */
  if (finished) {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-8 text-center dark:bg-zinc-950">
        <div className="absolute left-5 top-5">
          <BackButton />
        </div>
        <h1 className="text-4xl font-bold lg:text-5xl">수고하셨습니다</h1>
        <p className="mt-3 text-xl text-zinc-500 dark:text-zinc-400">
          {position.name} 교육을 모두 마쳤습니다.
        </p>

        {asked === null ? (
          <div className="mt-10 w-full max-w-2xl">
            <p className="text-lg text-zinc-600 dark:text-zinc-300">
              보는 동안 선배에게 몇 번 물어보셨나요?
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {["0번", "1~2번", "3~5번", "6번 이상"].map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setAsked(label);
                    log("survey", {
                      positionSlug: position.shareSlug,
                      askedSenior: label,
                      mode: "training",
                    });
                  }}
                  className="rounded-2xl border-2 border-orange-300 bg-white py-6 text-xl font-bold text-orange-700 active:bg-orange-100 dark:border-orange-800 dark:bg-zinc-900 dark:text-orange-300"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-8 text-lg text-zinc-500 dark:text-zinc-400">
            답변 감사합니다.
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setFinished(false);
            setAsked(null);
          }}
          className="mt-12 rounded-2xl border-2 border-zinc-300 px-12 py-5 text-xl font-semibold text-zinc-600 active:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300"
        >
          처음으로
        </button>
      </div>
    );
  }

  /* ---------------- 항목 화면 ---------------- */
  if (!task || !run) return null;

  const ytId = task.videoUrl ? youtubeId(task.videoUrl) : null;
  const hasMedia = Boolean(task.goodImage || ytId);
  const pct = Math.round(((run.idx + 1) / total) * 100);

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* 상단: 어디쯤 왔는지 */}
      <header className="shrink-0 border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-4">
          <BackButton />
          <p className="min-w-0 flex-1 truncate text-lg font-bold">
            {position.name}
            <span className="ml-2 text-base font-normal text-zinc-500 dark:text-zinc-400">
              {task.sectionTitle}
            </span>
          </p>
          <p className="shrink-0 text-lg font-bold tabular-nums text-orange-600 dark:text-orange-400">
            {run.idx + 1} / {total}
          </p>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-orange-500 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </header>

      {/* 본문: 가로 화면이면 사진 | 설명, 세로면 위아래로 */}
      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        <div
          className={[
            "mx-auto grid h-full max-w-6xl gap-6",
            hasMedia ? "lg:grid-cols-[1.1fr_1fr]" : "max-w-3xl",
          ].join(" ")}
        >
          {hasMedia && (
            <div className="flex items-center justify-center">
              {ytId ? (
                <div className="aspect-video w-full overflow-hidden rounded-2xl border border-zinc-200 bg-black dark:border-zinc-800">
                  <iframe
                    src={`https://www.youtube.com/embed/${ytId}`}
                    title={`${task.title} 영상 가이드`}
                    allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full"
                  />
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={task.goodImage ?? ""}
                  alt={task.title}
                  className="max-h-full w-full rounded-2xl border border-zinc-200 object-contain dark:border-zinc-800"
                />
              )}
            </div>
          )}

          <div className="flex flex-col justify-center">
            {task.critical && (
              <span className="mb-3 inline-block w-fit rounded-lg bg-red-100 px-3 py-1.5 text-base font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                꼭 지키기
              </span>
            )}
            <h2 className="text-3xl font-bold leading-tight lg:text-4xl">
              {task.title}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-zinc-700 lg:text-xl dark:text-zinc-200">
              {task.desc}
            </p>
            {task.tip && (
              <p className="mt-5 rounded-2xl bg-zinc-100 px-5 py-4 text-base leading-relaxed text-zinc-600 lg:text-lg dark:bg-zinc-800 dark:text-zinc-300">
                <span className="font-bold">선배 한마디 </span>
                {task.tip}
              </p>
            )}

            {/* 안전·위생 항목은 읽었다는 확인을 받고 넘어간다 */}
            {task.critical && (
              <button
                type="button"
                onClick={confirm}
                disabled={isConfirmed}
                className={[
                  "mt-6 w-fit rounded-2xl px-8 py-4 text-lg font-bold transition-colors",
                  isConfirmed
                    ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                    : "bg-red-600 text-white active:bg-red-700",
                ].join(" ")}
              >
                {isConfirmed ? "확인했습니다" : "읽었습니다"}
              </button>
            )}
          </div>
        </div>
      </main>

      {/* 하단: 큰 이동 버튼 */}
      <footer className="shrink-0 border-t border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={run.idx === 0}
            className="rounded-2xl border-2 border-zinc-300 px-8 py-5 text-lg font-semibold text-zinc-600 disabled:opacity-30 active:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300"
          >
            이전
          </button>

          <p className="flex-1 text-center text-sm text-zinc-400">
            {canGoNext
              ? "다 읽었으면 다음을 누르세요"
              : "위의 [읽었습니다]를 눌러야 넘어갑니다"}
          </p>

          <button
            type="button"
            onClick={() => go(1)}
            disabled={!canGoNext}
            className="rounded-2xl bg-orange-500 px-12 py-5 text-xl font-bold text-white disabled:bg-zinc-300 active:bg-orange-600 dark:disabled:bg-zinc-700"
          >
            {run.idx + 1 === total ? "끝내기" : "다음"}
          </button>
        </div>
      </footer>
    </div>
  );
}
