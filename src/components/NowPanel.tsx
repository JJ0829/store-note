"use client";

import { useEffect, useState } from "react";
import { minutesOfDay, onDutyNow } from "@/lib/shiftClock";
import Link from "next/link";
import type { Shift, ShiftFocus } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * 지금 시간에 맞는 화면을 먼저 띄운다.
 *
 * 근무 스케줄은 부가 기능이 아니라 "어느 화면을 첫 화면으로 줄지"를
 * 고르는 기준이다. 매장 태블릿을 켠 사람이 메뉴를 뒤져야 하면 안 쓴다.
 * ------------------------------------------------------------------ */

function focusHref(f: ShiftFocus): string {
  switch (f.kind) {
    case "training":
      return `/t/${f.slug}`;
    case "checklist":
      return `/p/${f.slug}`;
    case "prep":
      return `/prep/${f.slug}`;
    case "recipes":
      // 프렙과 레시피를 합친 화면으로 보낸다 (2026-09-10). `/r` 도 그대로 산다
      return "/prep";
  }
}

export default function NowPanel({ shifts }: { shifts: Shift[] }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    // 매장에 하루 종일 켜두는 태블릿이라 시간이 흘러도 화면이 따라가야 한다
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // 서버에서 렌더할 때는 시각을 모른다. 자리만 잡아둔다.
  if (!now) {
    return (
      <div className="mt-5 h-[132px] animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-900" />
    );
  }

  const cur = minutesOfDay(now);
  // ★ 2026-09-12 부터 **하루의 순서대로** 선다 — 오픈 → 미들 → 마감 (`onDutyNow`).
  const onNow = new Set(onDutyNow(shifts, cur).map((s) => s.id));

  /* ★ **근무 중인 조만 보여주지 않는다** (사장님 지적 2026-09-12).
   *
   *   전에는 지금 근무 중인 조만 그렸다. 그러니 15:40 에 열면 오픈조(07:30~15:30)가
   *   **화면에서 통째로 사라져서** "왜 지웠냐" 가 됐다. 지운 적이 없는데
   *   화면은 지운 것처럼 보인다 — 그게 더 나쁘다.
   *
   *   이제 **네 조를 늘 다 보여주고**, 지금 일하는 조만 주황으로 띄운다.
   *   끝난 조는 흐리게 두되 **자리는 지킨다** — 매장 사람은 조가 몇 개인지
   *   알고 있고, 그중 하나가 없으면 고장으로 읽는다. */
  const ordered = [...shifts].sort((a, b) => {
    const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    return m(a.start) - m(b.start);
  });

  return (
    <div className="mt-5 flex flex-col gap-3">
      {ordered.map((shift) => {
        const on = onNow.has(shift.id);
        return (
          <div
            key={shift.id}
            className={[
              "rounded-2xl border p-4 transition-colors",
              on
                ? "border-orange-300 bg-orange-50 dark:border-orange-900/60 dark:bg-orange-950/40"
                : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
            ].join(" ")}
          >
            <p
              className={[
                "text-[13px]",
                on
                  ? "font-bold text-orange-700 dark:text-orange-300"
                  : "text-zinc-400 dark:text-zinc-500",
              ].join(" ")}
            >
              {on ? "● 근무 중" : cur < minutesOfDay2(shift.start) ? "아직 전" : "끝남"}
            </p>
            <h2
              className={[
                "mt-0.5 text-[17px] font-bold",
                on ? "" : "text-zinc-500 dark:text-zinc-400",
              ].join(" ")}
            >
              {shift.name}
              <span className="ml-2 text-[13px] font-normal text-zinc-500 dark:text-zinc-400">
                {shift.start} ~ {shift.end}
              </span>
            </h2>
            {shift.note && (
              <p
                className={[
                  "mt-1 text-[13px]",
                  on
                    ? "text-zinc-600 dark:text-zinc-300"
                    : "text-zinc-400 dark:text-zinc-500",
                ].join(" ")}
              >
                {shift.note}
              </p>
            )}

            <div className="mt-3 flex flex-col gap-2">
              {shift.focus.map((f, fi) => (
                <Link
                  key={`${shift.id}-${fi}`}
                  href={focusHref(f)}
                  className={[
                    "flex items-center justify-between rounded-xl px-4 py-3.5 text-[15px] font-bold transition-colors",
                    // 조마다 첫 줄이 그 조의 주 동선이다. 근무 중인 조만 색을 준다
                    on && fi === 0
                      ? "bg-orange-500 text-white active:bg-orange-600"
                      : "border border-zinc-300 bg-white text-zinc-700 active:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:active:bg-zinc-800",
                  ].join(" ")}
                >
                  {f.label}
                  <span aria-hidden className="text-lg leading-none">
                    ›
                  </span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** "07:30" → 450. 근무 전/후를 가르는 데만 쓴다 */
function minutesOfDay2(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
}
