"use client";

import { useState } from "react";

/* ------------------------------------------------------------------ *
 * 달력으로 주 고르기.
 *
 * ★ 사장님 요청 (2026-09-12): "주, 월 여기에 ‹9/28(월) ~ 10/4(일)› 이렇게 말고
 *   달력이 있었으면."
 *
 *   그 전에는 [지난주] [다음주] 두 버튼뿐이라, 3주 뒤 근무표를 짜려면
 *   **세 번 눌러야** 했고 그동안 지금 어디인지는 글자로만 읽어야 했다.
 *   사람은 날짜를 **달력 모양으로** 기억한다 — "둘째 주 목요일" 같은 식이다.
 *
 * ⚠️ 고르는 것은 **날**이 아니라 **그 날이 속한 주**다. 근무표의 단위가 주라서다.
 *   그래서 마우스를 올리면 그 주 전체가 같이 밝아진다 — 하루만 고르는 것으로
 *   보이면 «금요일만 짜는 화면» 으로 오해한다.
 * ------------------------------------------------------------------ */

const 요일 = ["일", "월", "화", "수", "목", "금", "토"];

/** 그 날이 속한 주의 월요일 (일요일은 그 앞 월요일) */
function mondayOf(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const back = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - back);
  return out;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

export default function MonthPicker({
  /** 지금 보고 있는 주의 월요일 */
  value,
  onPick,
  onClose,
}: {
  value: Date;
  onPick: (monday: Date) => void;
  onClose: () => void;
}) {
  const [cursor, setCursor] = useState(
    () => new Date(value.getFullYear(), value.getMonth(), 1),
  );

  const today = new Date();
  const todayKey = ymd(today);
  const pickedMonday = ymd(mondayOf(value));

  /* 달력 칸 — 그 달 1일이 든 주의 일요일부터 6주(42칸).
     달마다 줄 수가 달라지면 화면이 튀어서 항상 6줄로 둔다. */
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  const moveMonth = (n: number) =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));

  return (
    <div className="mt-2 rounded-2xl border-2 border-zinc-300 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => moveMonth(-1)}
          aria-label="지난 달"
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[13px] font-semibold dark:border-zinc-700"
        >
          ‹
        </button>
        <span className="text-[14px] font-bold">
          {cursor.getFullYear()}년 {cursor.getMonth() + 1}월
        </span>
        <button
          type="button"
          onClick={() => moveMonth(1)}
          aria-label="다음 달"
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[13px] font-semibold dark:border-zinc-700"
        >
          ›
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-0.5 text-center">
        {요일.map((w, i) => (
          <div
            key={w}
            className={[
              "py-1 text-[11px] font-semibold",
              i === 0
                ? "text-red-500"
                : i === 6
                  ? "text-blue-500"
                  : "text-zinc-400",
            ].join(" ")}
          >
            {w}
          </div>
        ))}

        {cells.map((d) => {
          const thisMonth = d.getMonth() === cursor.getMonth();
          const inPicked = ymd(mondayOf(d)) === pickedMonday;
          const isToday = ymd(d) === todayKey;
          return (
            <button
              key={ymd(d)}
              type="button"
              onClick={() => {
                onPick(mondayOf(d));
                onClose();
              }}
              aria-current={inPicked ? "date" : undefined}
              aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일이 든 주`}
              className={[
                "rounded-md py-2 text-[13px] tabular-nums transition-colors",
                /* 고른 주는 통째로 밝아진다 — 고르는 단위가 주라서다 */
                inPicked
                  ? "bg-orange-500 font-bold text-white"
                  : thisMonth
                    ? "text-zinc-800 hover:bg-orange-100 dark:text-zinc-100 dark:hover:bg-orange-950/60"
                    : "text-zinc-300 hover:bg-zinc-100 dark:text-zinc-600 dark:hover:bg-zinc-800",
                isToday && !inPicked
                  ? "ring-2 ring-inset ring-orange-400"
                  : "",
              ].join(" ")}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            onPick(mondayOf(new Date()));
            onClose();
          }}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[13px] font-semibold dark:border-zinc-700"
        >
          이번 주로
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-2 text-[13px] text-zinc-500"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
