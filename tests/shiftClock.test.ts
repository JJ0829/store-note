/* ------------------------------------------------------------------ *
 * 근무조가 지금 근무 중인가 — 자정을 넘는 조가 있다.
 *
 * ★ 이 파일이 막는 사고: **자정을 넘긴 조가 홈 화면에서 영영 안 뜨는 것.**
 *   옛 판정 `cur >= start && cur < end` 는 끝이 시작보다 이르면
 *   **어느 시각에도 참이 안 된다.**
 *
 *   평소 마감조는 `14:30~22:30` 이라 자정을 안 넘는다. 그런데
 *   **01:00 퇴근이 "특별한 경우"로 실제 있다**(사장님 확인 2026-09-09).
 *   그날 근무조를 `14:30~01:00` 으로 잡으면 옛 판정에서 통째로 사라졌다.
 *   **예외인 날일수록 화면이 죽으면 안 된다.**
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import {
  crossesMidnight,
  isOnDuty,
  minutesOfDay,
  nextShift,
  onDutyNow,
} from "../src/lib/shiftClock.ts";

/** 시드의 실제 근무조 4개 (2026-09-09 확정) */
const BAKE = { name: "제빵", start: "05:00", end: "13:00" };
const OPEN = { name: "오픈조", start: "07:30", end: "15:30" };
const MID = { name: "미들", start: "11:00", end: "19:00" };
const CLOSE = { name: "마감조", start: "14:30", end: "22:30" };
const ALL = [BAKE, OPEN, MID, CLOSE];

/**
 * ★ 자정을 넘는 조 — **평소 시드에는 없다.**
 *
 * 영업은 22:00 에 끝나고 마감은 22:30 에 완료된다(사장님 확인 2026-09-09).
 * 그런데 **01:00 퇴근이 "특별한 경우"로 실제 있다.** 그날의 근무조를
 * `14:30~01:00` 으로 잡으면 옛 판정(`cur >= start && cur < end`)에서는
 * 그 조가 **어느 시각에도 안 잡힌다.**
 *
 * 즉 이 지원은 평상시가 아니라 **예외인 날을 위한 것**이다.
 * 예외인 날일수록 화면이 죽으면 안 된다.
 */
const CLOSE_LATE = { name: "마감조(연장)", start: "14:30", end: "01:00" };

const hm = (h: number, m = 0) => h * 60 + m;

/* ---------- 자정 넘김 판별 ---------- */

test("평소 마감조는 자정을 안 넘는다 (22:30 종료)", () => {
  assert.equal(crossesMidnight(CLOSE), false);
});

test("★ 연장된 날의 마감조는 자정을 넘는 조다 (01:00 퇴근)", () => {
  assert.equal(crossesMidnight(CLOSE_LATE), true);
});

test("나머지 조도 자정을 안 넘는다", () => {
  for (const s of [BAKE, OPEN, MID]) assert.equal(crossesMidnight(s), false, s.name);
});

/* ---------- ★ 마감조 — 이 파일의 존재 이유 ---------- */

test("18:00 에 마감조가 근무 중이다 (마감 준비 시작 19:00 전)", () => {
  assert.equal(isOnDuty(CLOSE, hm(18)), true);
});

test("★ 19:00 마감 준비 시작 시각에 마감조가 근무 중이다", () => {
  assert.equal(isOnDuty(CLOSE, hm(19)), true);
});

test("22:00 영업 종료 시각에도 아직 근무 중이다 (마감 30분)", () => {
  assert.equal(isOnDuty(CLOSE, hm(22)), true);
  assert.equal(isOnDuty(CLOSE, hm(22, 29)), true);
  assert.equal(isOnDuty(CLOSE, hm(22, 30)), false);
});

test("★★ 연장된 날 00:30 에도 마감조가 잡힌다 — 예외인 날일수록 화면이 죽으면 안 된다", () => {
  assert.equal(isOnDuty(CLOSE_LATE, hm(0, 30)), true, "연장된 날 새벽에 마감조가 안 잡힌다");
  // 평소 조는 당연히 아니다
  assert.equal(isOnDuty(CLOSE, hm(0, 30)), false);
});

test("14:30 정각에 시작한다", () => {
  assert.equal(isOnDuty(CLOSE, hm(14, 30)), true);
  assert.equal(isOnDuty(CLOSE, hm(14, 29)), false);
});

test("연장된 날은 01:00 에 끝난다 — 그 시각은 이미 근무 밖", () => {
  assert.equal(isOnDuty(CLOSE_LATE, hm(0, 59)), true);
  assert.equal(isOnDuty(CLOSE_LATE, hm(1, 0)), false);
});

/* ---------- 보통 조 ---------- */

test("제빵조는 05:00~13:00", () => {
  assert.equal(isOnDuty(BAKE, hm(4, 59)), false);
  assert.equal(isOnDuty(BAKE, hm(5)), true);
  assert.equal(isOnDuty(BAKE, hm(12, 59)), true);
  assert.equal(isOnDuty(BAKE, hm(13)), false);
});

/* ---------- 정렬: 방금 시작한 조가 앞 ---------- */

test("07:30 에는 오픈조가 제빵보다 앞이다 (막 출근한 사람 화면이 위)", () => {
  const on = onDutyNow(ALL, hm(7, 30));
  assert.deepEqual(
    on.map((s) => s.name),
    ["오픈조", "제빵"],
  );
});

test("18:00 에는 마감조가 미들보다 앞이다", () => {
  const on = onDutyNow(ALL, hm(18));
  assert.deepEqual(
    on.map((s) => s.name),
    ["마감조", "미들"],
  );
});

test("22:00 에는 마감조만 남는다 (미들 19:00 퇴근)", () => {
  assert.deepEqual(onDutyNow(ALL, hm(22)).map((s) => s.name), ["마감조"]);
});

test("★ 연장된 날 00:30 의 마감조는 '방금 시작한 조'가 아니다 — 어제 14:30 에 시작했다", () => {
  // 자정을 넘긴 상태에서 start 를 그대로 쓰면 미래에 시작한 것처럼 보인다
  const on = onDutyNow([BAKE, OPEN, MID, CLOSE_LATE], hm(0, 30));
  assert.deepEqual(on.map((s) => s.name), ["마감조(연장)"]);
});

test("겹치는 조가 새벽에 둘이면 먼저 시작한 쪽이 뒤로 간다", () => {
  const NIGHT = { name: "야간", start: "23:00", end: "07:00" }; // 마감조보다 늦게 시작
  const on = onDutyNow([CLOSE_LATE, NIGHT], hm(0, 30));
  assert.deepEqual(
    on.map((s) => s.name),
    ["야간", "마감조(연장)"],
    "새벽에 시작 순서가 뒤집혔다",
  );
});

/* ---------- 다음 조 ---------- */

test("근무 시간이 아니면 다음 조를 알려준다", () => {
  assert.equal(nextShift(ALL, hm(3))?.name, "제빵"); // 새벽 3시 → 05:00 제빵
});

test("★ 오늘 남은 조가 없으면 내일 첫 조로 넘어간다", () => {
  // 예전에는 `shifts[0]`(시드 등록 순서)로 떨어져 엉뚱한 조를 알려줬다
  assert.equal(nextShift(ALL, hm(23, 30))?.name, "제빵");
});

test("22:30 마감 후 새벽 3시는 아무도 근무 중이 아니다", () => {
  assert.deepEqual(onDutyNow(ALL, hm(3)), []);
});

test("근무조가 없으면 null", () => {
  assert.equal(nextShift([], hm(10)), null);
});

/* ---------- 잘못된 값 방어 ---------- */

test("시각이 깨져 있으면 근무 중으로 보지 않는다", () => {
  // 관대하게 굴면 엉뚱한 조가 홈 첫 화면에 뜬다
  assert.equal(isOnDuty({ start: "빈값", end: "01:00" }, hm(18)), false);
  assert.equal(isOnDuty({ start: "17:00", end: "" }, hm(18)), false);
});

test("시작과 끝이 같으면 길이 0 으로 보고 근무 중이 아니다", () => {
  assert.equal(isOnDuty({ start: "17:00", end: "17:00" }, hm(17)), false);
});

test("깨진 조가 섞여 있어도 나머지는 정상 판정한다", () => {
  const on = onDutyNow([{ name: "깨짐", start: "x", end: "y" }, CLOSE], hm(18));
  assert.deepEqual(
    on.map((s) => s.name),
    ["마감조"],
  );
});

/* ---------- minutesOfDay ---------- */

test("minutesOfDay 는 시:분을 분으로 편다", () => {
  assert.equal(minutesOfDay(new Date(2026, 8, 9, 0, 30)), 30);
  assert.equal(minutesOfDay(new Date(2026, 8, 9, 17, 0)), 1020);
  assert.equal(minutesOfDay(new Date(2026, 8, 9, 23, 59)), 1439);
});
