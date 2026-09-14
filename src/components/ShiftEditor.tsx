"use client";

import { useState } from "react";
import {
  isHhmm,
  putShiftEdit,
  saveShiftEdits,
  type ShiftEdits,
} from "@/lib/shiftEdit";
import { ro } from "@/lib/store";
import type { Shift } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * 근무조 이름·시간 고치기.
 *
 * 시드 값은 **한 매장의 값**이다. 오픈 07:30 도 마감 22:30 도 매장마다
 * 다르고, 「아침」·「저녁」이라고 부르는 곳도 있다. 앱이 남의 매장 시간을
 * 사실처럼 띄우면 그 화면은 처음부터 틀린 말을 한다.
 *
 * ★ 이름을 바꾸면 지난 근무표 배정도 같이 옮긴다 — 그리고 **몇 칸 옮겼는지
 *   말해 준다.** 근무표는 배정을 조 이름으로 저장하므로(조 id 가 아니다)
 *   안 옮기면 지각 판정과 인건비가 조용히 달라진다. 조용히 고치면
 *   사장님이 나중에 근태를 보고 놀란다. → `src/lib/shiftEdit.ts`
 * ------------------------------------------------------------------ */

const box =
  "rounded-lg border-2 border-zinc-300 bg-white px-2.5 py-2 text-[14px] outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-900";

export default function ShiftEditor({
  shifts,
  edits,
  onChange,
}: {
  /** 이미 고친 값이 입혀진 조 목록 (화면에 보이는 그대로) */
  shifts: Shift[];
  edits: ShiftEdits;
  onChange: (next: ShiftEdits) => void;
}) {
  const [open, setOpen] = useState(false);
  const [moved, setMoved] = useState<{ name: string; n: number } | null>(null);
  const [bad, setBad] = useState<string | null>(null);

  const edit = (s: Shift, patch: Partial<{ name: string; start: string; end: string }>) => {
    const next = {
      name: patch.name ?? s.name,
      start: patch.start ?? s.start,
      end: patch.end ?? s.end,
    };
    // 시각이 깨진 채로 저장하면 그 조가 화면에서 통째로 사라진다
    if (!isHhmm(next.start) || !isHhmm(next.end)) {
      setBad(s.id);
      return;
    }
    setBad(null);
    const r = putShiftEdit(edits, s.id, s.name, next);
    saveShiftEdits(r.edits);
    onChange(r.edits);
    if (r.moved > 0) setMoved({ name: next.name, n: r.moved });
  };

  return (
    <section className="mt-5 rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-[15px] font-bold">근무조 고치기</span>
        <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
          {shifts.map((s) => s.name).join(" · ")} {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <p className="text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            매장마다 오픈·마감 시간이 다릅니다. 여기서 고치면 첫 화면과
            출퇴근·근무표가 모두 이 값을 씁니다.
            <b className="text-zinc-700 dark:text-zinc-200">
              {" "}
              이름을 바꾸면 지난 근무표 배정도 같이 옮깁니다.
            </b>
          </p>

          <div className="mt-3 flex flex-col gap-2">
            {shifts.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2">
                <input
                  defaultValue={s.name}
                  onBlur={(e) => edit(s, { name: e.target.value })}
                  aria-label={`${s.name} 이름`}
                  className={`${box} w-[7.5rem] font-bold`}
                />
                <input
                  type="time"
                  defaultValue={s.start}
                  onBlur={(e) => edit(s, { start: e.target.value })}
                  aria-label={`${s.name} 시작 시각`}
                  className={`${box} tabular-nums`}
                />
                <span aria-hidden className="text-zinc-400">~</span>
                <input
                  type="time"
                  defaultValue={s.end}
                  onBlur={(e) => edit(s, { end: e.target.value })}
                  aria-label={`${s.name} 끝 시각`}
                  className={`${box} tabular-nums`}
                />
                {bad === s.id && (
                  <span className="text-[12px] font-semibold text-red-600 dark:text-red-400">
                    시각을 다시 넣어주세요
                  </span>
                )}
              </div>
            ))}
          </div>

          {moved && (
            <p
              role="status"
              aria-live="polite"
              className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
            >
              {/* 조사는 이름의 받침을 본다 — 「아침조」로 / 「오픈」으로.
                  괄호까지 넘기면 ro() 가 `」` 를 보고 늘 「로」를 낸다 */}
              지난 근무표 {moved.n}칸도 「{moved.name}」
              {ro(moved.name).slice(moved.name.length)} 같이 바꿨습니다.
            </p>
          )}

          <p className="mt-3 text-[12px] text-zinc-400 dark:text-zinc-500">
            ⚠️ 마감조가 자정을 넘는 날은 끝 시각을 01:00 처럼 넣으면 됩니다 —
            앱이 자정 넘김을 알아서 처리합니다.
          </p>
        </div>
      )}
    </section>
  );
}
