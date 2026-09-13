/* ------------------------------------------------------------------ *
 * 근무조를 매장이 고친다.
 *
 * ★ 왜 필요한가 (사장님 지시 2026-09-13).
 *
 *   시드의 `제빵 05:00~13:00 · 오픈조 07:30~15:30 · 마감조 14:30~22:30` 은
 *   **한 매장의 값**이다. 오픈 시각도 마감 시각도 매장마다 다르고, 조 이름을
 *   「아침」·「저녁」이라고 부르는 곳도 있다. 앱이 남의 매장 시간을 띄우면
 *   그 화면은 처음부터 틀린 말을 한다 — 주기 숫자(`everyDays`)를 시드에
 *   안 박아둔 것과 같은 이유다.
 *
 *   그래서 시드는 **기본값**으로만 두고, 고친 값은 매장의 브라우저에 남긴다.
 *
 * ────────────────────────────────────────────────────────────────
 * ★★ 이름을 바꾸면 근무표도 같이 고쳐야 한다. 이게 이 파일의 존재 이유다.
 *
 *   근무표는 배정을 **조 이름 문자열**로 저장한다 — `assign[직원][날짜] = "오픈조"`.
 *   조 id 가 아니다. 그래서 「오픈조」를 「아침조」로 바꾸면 지난 배정이 전부
 *   **없는 조**를 가리키게 된다. 그러면
 *     · 지각 판정이 사라진다 (`estimateDay` 가 시작 시각을 못 찾는다)
 *     · 홈 화면의 「근무 중」이 안 붙는다 (조 이름으로 맞춘다)
 *     · 근태·인건비가 조용히 달라진다
 *   화면에는 아무 오류도 안 뜬다. **그래서 이름을 바꿀 때 배정을 같이 옮긴다.**
 * ------------------------------------------------------------------ */

import { loadJson, saveJson } from "./store.ts";
import { loadRoster, saveRoster } from "./roster.ts";
import type { Shift } from "./types.ts";

/** `edits[조 id] = { name, start, end }`. 시드 위에 덮어쓴다 */
export type ShiftEdit = { name: string; start: string; end: string };
export type ShiftEdits = Record<string, ShiftEdit>;

const KEY = "sop:shifts";

export function loadShiftEdits(): ShiftEdits {
  return loadJson<ShiftEdits>(KEY, {});
}

export function saveShiftEdits(edits: ShiftEdits): boolean {
  return saveJson(KEY, edits);
}

/** "07:30" 인가. 아니면 저장하지 않는다 — 깨진 시각은 근무조를 화면에서 지운다 */
export function isHhmm(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim());
}

/**
 * 시드 조 + 매장이 고친 값.
 *
 * 고친 값이 깨져 있으면(빈 이름·잘못된 시각) **그 칸만 버리고 시드 값을 쓴다.**
 * 통째로 버리면 멀쩡한 다른 칸까지 사라지고, 그대로 쓰면 조가 화면에서
 * 사라진다 — `shiftClock.isOnDuty` 가 시각이 깨지면 «근무 중 아님» 으로 본다.
 */
export function applyShiftEdits(shifts: Shift[], edits: ShiftEdits): Shift[] {
  return shifts.map((s) => {
    const e = edits[s.id];
    if (!e) return s;
    return {
      ...s,
      name: e.name.trim() || s.name,
      start: isHhmm(e.start) ? e.start.trim() : s.start,
      end: isHhmm(e.end) ? e.end.trim() : s.end,
    };
  });
}

/**
 * 근무표의 배정을 옛 이름 → 새 이름으로 옮긴다.
 *
 * 옮긴 칸 수를 돌려준다 — 화면이 "지난 배정 N칸도 같이 바꿨습니다" 라고
 * 말할 수 있어야 한다. 조용히 고치면 사장님이 나중에 근태를 보고 놀란다.
 */
export function renameInAssign(
  assign: Record<string, Record<string, string>>,
  from: string,
  to: string,
): { assign: Record<string, Record<string, string>>; moved: number } {
  if (!from || !to || from === to) return { assign, moved: 0 };
  let moved = 0;
  const next: Record<string, Record<string, string>> = {};
  for (const [staffId, byDate] of Object.entries(assign)) {
    const row: Record<string, string> = {};
    for (const [date, name] of Object.entries(byDate ?? {})) {
      if (name === from) {
        row[date] = to;
        moved += 1;
      } else {
        row[date] = name;
      }
    }
    next[staffId] = row;
  }
  return { assign: next, moved };
}

/**
 * 조 하나를 고쳐서 저장한다. 이름이 바뀌었으면 근무표도 같이 옮긴다.
 *
 * `prevName` 은 **지금 화면에 보이던 이름**이다(시드 이름이 아니라).
 * 두 번 연달아 고치면 시드 이름은 이미 한 번 떠난 뒤라 그것으로 찾으면 못 찾는다.
 */
export function putShiftEdit(
  edits: ShiftEdits,
  shiftId: string,
  prevName: string,
  next: ShiftEdit,
): { edits: ShiftEdits; moved: number } {
  const name = next.name.trim();
  const merged: ShiftEdits = {
    ...edits,
    [shiftId]: {
      name: name || prevName,
      start: isHhmm(next.start) ? next.start.trim() : "",
      end: isHhmm(next.end) ? next.end.trim() : "",
    },
  };

  let moved = 0;
  if (name && name !== prevName) {
    const roster = loadRoster();
    const r = renameInAssign(roster.assign, prevName, name);
    moved = r.moved;
    if (moved > 0) saveRoster({ ...roster, assign: r.assign });
  }
  return { edits: merged, moved };
}
