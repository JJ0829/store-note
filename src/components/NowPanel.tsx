"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Shift, ShiftFocus } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * 지금 시간에 맞는 화면을 먼저 띄운다.
 *
 * 근무 스케줄은 부가 기능이 아니라 "어느 화면을 첫 화면으로 줄지"를
 * 고르는 기준이다. 매장 태블릿을 켠 사람이 메뉴를 뒤져야 하면 안 쓴다.
 * ------------------------------------------------------------------ */

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function focusHref(f: ShiftFocus): string {
  switch (f.kind) {
    case "training":
      return `/t/${f.slug}`;
    case "checklist":
      return `/p/${f.slug}`;
    case "prep":
      return `/prep/${f.slug}`;
    case "recipes":
      return "/r";
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

  const cur = now.getHours() * 60 + now.getMinutes();
  // 겹치는 시간대에는 방금 시작한 조를 위에 둔다.
  // 시드 등록 순서로 두면 07:30에 제빵(05:00 시작)이 먼저 떠서,
  // 그 시각에 막 출근한 오픈조가 자기 화면을 아래에서 찾아야 한다.
  const active = shifts
    .filter((s) => cur >= toMinutes(s.start) && cur < toMinutes(s.end))
    .sort((a, b) => toMinutes(b.start) - toMinutes(a.start));

  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;

  // 근무 시간이 아니면 다음 조를 알려준다
  if (active.length === 0) {
    const upcoming =
      shifts
        .filter((s) => toMinutes(s.start) > cur)
        .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))[0] ?? shifts[0];

    return (
      <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          지금 {clock} · 근무 시간이 아닙니다
        </p>
        <p className="mt-1 text-[15px] font-bold">
          다음은 {upcoming.name} · {upcoming.start}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 flex flex-col gap-3">
      {active.map((shift, i) => (
        <div
          key={shift.id}
          className={[
            "rounded-2xl border p-4",
            i === 0
              ? "border-orange-300 bg-orange-50 dark:border-orange-900/60 dark:bg-orange-950/40"
              : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
          ].join(" ")}
        >
          <p
            className={[
              "text-[13px]",
              i === 0
                ? "text-orange-900/70 dark:text-orange-100/70"
                : "text-zinc-500 dark:text-zinc-400",
            ].join(" ")}
          >
            {i === 0 ? `지금 ${clock} · 근무 중` : "같은 시간대"}
          </p>
          <h2 className="mt-0.5 text-[17px] font-bold">
            {shift.name}
            <span className="ml-2 text-[13px] font-normal text-zinc-500 dark:text-zinc-400">
              {shift.start} ~ {shift.end}
            </span>
          </h2>
          {shift.note && (
            <p className="mt-1 text-[13px] text-zinc-600 dark:text-zinc-300">
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
                  i === 0 && fi === 0
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
      ))}
    </div>
  );
}
