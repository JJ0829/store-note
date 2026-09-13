/* ------------------------------------------------------------------ *
 * 근무조를 매장이 고친다.
 *
 * ★ 여기서 조용히 틀릴 수 있는 곳은 둘이다.
 *   1) 시각이 깨진 채 저장되면 그 조가 **화면에서 통째로 사라진다**
 *      (`shiftClock.isOnDuty` 는 시각이 깨지면 «근무 중 아님» 으로 본다)
 *   2) 이름만 바꾸고 근무표를 안 옮기면 **지난 배정이 없는 조를 가리킨다**
 *      → 지각 판정이 사라지고 인건비가 달라지는데 화면에는 아무 말도 안 뜬다
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import {
  applyShiftEdits,
  isHhmm,
  renameInAssign,
  type ShiftEdits,
} from "../src/lib/shiftEdit.ts";
import type { Shift } from "../src/lib/types.ts";

const SEED: Shift[] = [
  { id: "sh-open", name: "오픈조", start: "07:30", end: "15:30", note: "", focus: [] },
  { id: "sh-close", name: "마감조", start: "14:30", end: "22:30", note: "", focus: [] },
];

test("고친 값이 없으면 시드 그대로", () => {
  assert.deepEqual(applyShiftEdits(SEED, {}), SEED);
});

test("이름과 시각을 고치면 그대로 덮어쓴다", () => {
  const edits: ShiftEdits = {
    "sh-open": { name: "아침조", start: "08:00", end: "16:00" },
  };
  const [open, close] = applyShiftEdits(SEED, edits);
  assert.equal(open.name, "아침조");
  assert.equal(open.start, "08:00");
  assert.equal(open.end, "16:00");
  assert.equal(close.name, "마감조"); // 안 건드린 조는 그대로
});

test("★ 시각이 깨져 있으면 그 칸만 시드로 되돌린다 — 조가 사라지면 안 된다", () => {
  const edits: ShiftEdits = {
    "sh-open": { name: "아침조", start: "25:00", end: "" },
  };
  const [open] = applyShiftEdits(SEED, edits);
  assert.equal(open.name, "아침조"); // 이름은 살린다
  assert.equal(open.start, "07:30"); // 깨진 시각만 버린다
  assert.equal(open.end, "15:30");
});

test("이름을 비우면 시드 이름으로 돌아간다 (빈 이름은 근무표에서 「휴무」와 같아진다)", () => {
  const [open] = applyShiftEdits(SEED, {
    "sh-open": { name: "   ", start: "08:00", end: "16:00" },
  });
  assert.equal(open.name, "오픈조");
});

test("isHhmm — 24시간 표기만 받는다", () => {
  assert.ok(isHhmm("00:00"));
  assert.ok(isHhmm("23:59"));
  assert.ok(!isHhmm("24:00"));
  assert.ok(!isHhmm("7:30"));
  assert.ok(!isHhmm("07:60"));
  assert.ok(!isHhmm(""));
});

test("★ 이름을 바꾸면 지난 배정도 같이 옮긴다", () => {
  const assign = {
    s1: { "2026-09-10": "오픈조", "2026-09-11": "마감조" },
    s2: { "2026-09-10": "오픈조", "2026-09-11": "" },
  };
  const r = renameInAssign(assign, "오픈조", "아침조");
  assert.equal(r.moved, 2);
  assert.equal(r.assign.s1["2026-09-10"], "아침조");
  assert.equal(r.assign.s1["2026-09-11"], "마감조"); // 다른 조는 안 건드린다
  assert.equal(r.assign.s2["2026-09-11"], ""); // 휴무도 그대로
});

test("같은 이름으로 바꾸면 아무것도 안 한다", () => {
  const assign = { s1: { "2026-09-10": "오픈조" } };
  const r = renameInAssign(assign, "오픈조", "오픈조");
  assert.equal(r.moved, 0);
  assert.equal(r.assign, assign);
});

test("★ 빈 이름으로는 옮기지 않는다 — 배정이 「휴무」로 바뀌어버린다", () => {
  const assign = { s1: { "2026-09-10": "오픈조" } };
  assert.equal(renameInAssign(assign, "오픈조", "").moved, 0);
  assert.equal(renameInAssign(assign, "", "아침조").moved, 0);
});
