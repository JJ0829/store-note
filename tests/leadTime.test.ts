/* ------------------------------------------------------------------ *
 * 리드타임 — 이 프로젝트에서 틀리면 가장 비싼 계산.
 *
 * readyAt이 틀리면 어제 안 시작해 둔 콜드브루·반죽이 오늘 아침에 없다.
 * recoverable:false 항목이라 돈으로도 못 메운다.
 * arrivesIn이 틀리면 금요일 발주를 "화요일 도착"으로 안내하고,
 * 월요일 아침에 원두가 없다.
 *
 * 모든 테스트가 기준 시각을 직접 넘긴다. `new Date()`를 쓰면 오늘 통과하고
 * 다음 주 월요일에 깨지는 테스트가 된다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import {
  WEEKDAY,
  arrivesIn,
  daysApart,
  readyAt,
  triggerLabel,
} from "../src/lib/leadTime.ts";

/* 참고 (실제 요일, 테스트가 여기 기대고 있다)
 *   2026-08-31 월 / 09-01 화 / 09-02 수 / 09-03 목
 *   2026-09-04 금 / 09-05 토 / 09-06 일 / 09-07 월
 *   2026-12-31 목 / 2027-01-01 금 / 2027-01-03 일
 */

/* ------------------------------------------------------------------ */
/* daysApart — 월말·연말을 그냥 빼면 틀린다                            */
/* ------------------------------------------------------------------ */

test("daysApart: 같은 날은 시각이 달라도 0", () => {
  assert.equal(
    daysApart(new Date(2026, 8, 4, 0, 1), new Date(2026, 8, 4, 23, 59)),
    0,
  );
});

test("daysApart: 8/31 → 9/1 은 1일 (월말)", () => {
  assert.equal(daysApart(new Date(2026, 7, 31), new Date(2026, 8, 1)), 1);
});

test("daysApart: 12/31 → 1/1 은 1일 (연말)", () => {
  assert.equal(daysApart(new Date(2026, 11, 31), new Date(2027, 0, 1)), 1);
});

test("daysApart: 2/28 → 2/29 는 1일 (윤년 2028)", () => {
  assert.equal(daysApart(new Date(2028, 1, 28), new Date(2028, 1, 29)), 1);
});

/* ------------------------------------------------------------------ */
/* readyAt — "지금 시작하면 언제부터 쓸 수 있나"                            */
/* ------------------------------------------------------------------ */

test("readyAt: 오늘 안에 끝나면 '오늘'", () => {
  assert.equal(readyAt(4, new Date(2026, 8, 4, 14, 0)), "오늘 18:00");
  assert.equal(readyAt(0, new Date(2026, 8, 4, 14, 0)), "오늘 14:00");
});

test("readyAt: 콜드브루 16시간 @ 8/31 14:00 → 내일 06:00 (월말 넘김)", () => {
  assert.equal(readyAt(16, new Date(2026, 7, 31, 14, 0)), "내일 06:00");
});

test("readyAt: 반죽 15시간 @ 12/31 23:30 → 내일 14:30 (연말 넘김)", () => {
  assert.equal(readyAt(15, new Date(2026, 11, 31, 23, 30)), "내일 14:30");
});

test("readyAt: 30분이라도 자정을 넘으면 '내일'", () => {
  assert.equal(readyAt(0.5, new Date(2026, 8, 4, 23, 45)), "내일 00:15");
});

test("readyAt: 정확히 24시간은 '내일', 48시간은 '모레'", () => {
  const base = new Date(2026, 8, 4, 14, 0);
  assert.equal(readyAt(24, base), "내일 14:00");
  assert.equal(readyAt(48, base), "모레 14:00");
});

test("readyAt: 3일 이상이면 요일 대신 날짜를 쓴다", () => {
  // "글피"는 주방에서 안 쓰는 말이라 날짜로 바꾼다
  assert.equal(readyAt(72, new Date(2026, 8, 4, 14, 0)), "9/7 14:00");
  assert.equal(readyAt(96, new Date(2026, 8, 4, 14, 0)), "9/8 14:00");
});

test("readyAt: 시·분은 두 자리로 채운다", () => {
  assert.equal(readyAt(1, new Date(2026, 8, 4, 8, 5)), "오늘 09:05");
});

/* ------------------------------------------------------------------ */
/* arrivesIn — 주말에는 배송이 없다                                     */
/* ------------------------------------------------------------------ */

test("arrivesIn: 평일 발주는 주말을 안 건드리면 그대로", () => {
  // 월 8/31 발주 +1일 → 화 9/1
  const r = arrivesIn(1, new Date(2026, 7, 31, 10, 0));
  assert.equal(r.label, "9/1(화)");
  assert.equal(r.overWeekend, false);
});

test("arrivesIn: 금요일 발주 +1일은 월요일에 온다", () => {
  const r = arrivesIn(1, new Date(2026, 8, 4, 10, 0));
  assert.equal(r.label, "9/7(월)");
  assert.equal(r.overWeekend, true);
});

test("arrivesIn: 토요일 발주 +1일도 월요일", () => {
  const r = arrivesIn(1, new Date(2026, 8, 5, 10, 0));
  assert.equal(r.label, "9/7(월)");
  assert.equal(r.overWeekend, true);
});

test("arrivesIn: 화요일 발주 +4영업일은 주말을 건너뛰어 월요일", () => {
  // 9/2 수·9/3 목·9/4 금 = 3영업일, 토·일 건너뛰고 9/7 월이 4일째
  const r = arrivesIn(4, new Date(2026, 8, 1, 10, 0));
  assert.equal(r.label, "9/7(월)");
  assert.equal(r.overWeekend, true);
});

test("arrivesIn: 연말을 넘어가도 맞다", () => {
  // 목 12/31 발주 +1 → 금 1/1
  const r = arrivesIn(1, new Date(2026, 11, 31, 10, 0));
  assert.equal(r.label, "1/1(금)");
  assert.equal(r.overWeekend, false);
});

test("arrivesIn: 당일배송(0일)이어도 토요일에는 오지 않는다", () => {
  // 예전 버그: while(left > 0) 이라 0일이면 루프가 안 돌고
  // "9/5(토) 도착"이 그대로 나왔다. 주말 배송이 없다는 게
  // 이 함수의 존재 이유인데 0일에서만 규칙이 통째로 빠져 있었다.
  const sat = arrivesIn(0, new Date(2026, 8, 5, 10, 0));
  assert.equal(sat.label, "9/7(월)");
  assert.equal(sat.overWeekend, true);

  const sun = arrivesIn(0, new Date(2026, 8, 6, 10, 0));
  assert.equal(sun.label, "9/7(월)");
  assert.equal(sun.overWeekend, true);
});

test("arrivesIn: 평일 당일배송(0일)은 오늘 온다", () => {
  const r = arrivesIn(0, new Date(2026, 8, 2, 10, 0));
  assert.equal(r.label, "9/2(수)");
  assert.equal(r.overWeekend, false);
});

test("arrivesIn: 음수 리드타임이 들어와도 과거 날짜를 만들지 않는다", () => {
  const r = arrivesIn(-3, new Date(2026, 8, 2, 10, 0));
  assert.equal(r.label, "9/2(수)");
});

test("arrivesIn: 23:59에 발주해도 날짜 계산이 밀리지 않는다", () => {
  const r = arrivesIn(1, new Date(2026, 8, 4, 23, 59));
  assert.equal(r.label, "9/7(월)");
});

/* ------------------------------------------------------------------ */
/* triggerLabel — 화면 뱃지 문구                                        */
/* ------------------------------------------------------------------ */

test("WEEKDAY는 일요일부터 시작한다 (Date.getDay와 같은 순서)", () => {
  assert.deepEqual(WEEKDAY, ["일", "월", "화", "수", "목", "금", "토"]);
});

test("triggerLabel: daily / weekday / condition", () => {
  assert.equal(triggerLabel({ type: "daily", at: "15:00" }), "매일 15:00");
  assert.equal(
    triggerLabel({ type: "weekday", days: [5], at: "16:00" }),
    "금 16:00",
  );
  assert.equal(
    triggerLabel({ type: "weekday", days: [1, 4], at: "09:00" }),
    "월·목 09:00",
  );
  assert.equal(
    triggerLabel({ type: "condition", when: "원두를 새로 깠을 때" }),
    "원두를 새로 깠을 때",
  );
});

test("triggerLabel: 주기는 30일·365일에서 단위가 바뀐다", () => {
  assert.equal(triggerLabel({ type: "cycle", everyDays: 7 }), "7일마다");
  assert.equal(triggerLabel({ type: "cycle", everyDays: 29 }), "29일마다");
  assert.equal(triggerLabel({ type: "cycle", everyDays: 30 }), "1개월마다");
  assert.equal(triggerLabel({ type: "cycle", everyDays: 180 }), "6개월마다");
  assert.equal(triggerLabel({ type: "cycle", everyDays: 364 }), "12개월마다");
  assert.equal(triggerLabel({ type: "cycle", everyDays: 365 }), "1년마다");
});

test("triggerLabel: 시드에 실제로 들어있는 주기값", () => {
  // 정수 필터 90·120일, 보건증 365일 — 반올림 결과를 못 박아 둔다
  assert.equal(triggerLabel({ type: "cycle", everyDays: 90 }), "3개월마다");
  assert.equal(triggerLabel({ type: "cycle", everyDays: 120 }), "4개월마다");
});

test("알려진 한계: 365일을 넘으면 전부 '1년마다'로 뭉친다", () => {
  // 지금 시드의 최대값이 365라 문제가 안 된다. 2년 주기 항목이 생기면
  // 이 테스트가 실패해야 맞다 — 그때 함수를 고치라는 표시다.
  assert.equal(triggerLabel({ type: "cycle", everyDays: 730 }), "1년마다");
});
