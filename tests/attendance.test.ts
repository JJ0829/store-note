/* ------------------------------------------------------------------ *
 * 출퇴근 · 근태 · 인건비.
 *
 * 돈이 걸린 계산이다. 특히 두 가지가 조용히 틀린다.
 *   1) 자정을 넘기는 마감조 → 음수 근로시간
 *   2) 5인 미만인데 연장 가산을 붙임 → 안 줘도 되는 돈을 계산에 넣음
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import {
  estimatePay,
  fromMin,
  hoursLabel,
  judgeDay,
  requiredBreak,
  toMin,
  workedMinutes,
  shiftPunchStates,
  type DayResult,
  type Punch,
} from "../src/lib/attendance.ts";
import type { Shift } from "../src/lib/types.ts";

function punch(inAt: string, outAt: string, breakMin = 0): Punch {
  return { id: "p1", staffId: "s1", date: "2026-09-04", inAt, outAt, breakMin, note: "" };
}

const SHIFTS: Shift[] = [
  { id: "sh1", name: "오픈조", start: "07:30", end: "15:30", focus: [], note: null },
  { id: "sh2", name: "마감조", start: "14:30", end: "22:30", focus: [], note: null },
];

/* ------------------------------------------------------------------ */
/* 시각 파싱                                                            */
/* ------------------------------------------------------------------ */

test("toMin / fromMin", () => {
  assert.equal(toMin("07:30"), 450);
  assert.equal(toMin("00:00"), 0);
  assert.equal(toMin("23:59"), 1439);
  assert.equal(toMin("7:05"), 425);
  assert.equal(fromMin(450), "07:30");
});

test("toMin: 말이 안 되는 시각은 null", () => {
  assert.equal(toMin(""), null);
  assert.equal(toMin("25:00"), null);
  assert.equal(toMin("12:70"), null);
  assert.equal(toMin("abc"), null);
});

/* ------------------------------------------------------------------ */
/* 실근로시간                                                           */
/* ------------------------------------------------------------------ */

test("휴게시간을 뺀다", () => {
  assert.equal(workedMinutes(punch("09:00", "18:00", 60)), 480);
  assert.equal(workedMinutes(punch("09:00", "18:00", 0)), 540);
});

test("★ 자정을 넘겨도 음수가 나오지 않는다", () => {
  // 23:00 출근 → 01:00 퇴근. 그냥 빼면 -22시간이고,
  // 그 값이 인건비로 들어가면 그날 인건비가 통째로 깎인다.
  assert.equal(workedMinutes(punch("23:00", "01:00")), 120);
  assert.equal(workedMinutes(punch("22:00", "06:00", 30)), 450);
});

test("퇴근을 안 찍었으면 null (0이 아니다)", () => {
  assert.equal(workedMinutes(punch("09:00", "")), null);
  assert.equal(workedMinutes(punch("", "")), null);
});

test("휴게가 근무시간보다 길어도 음수가 아니다", () => {
  assert.equal(workedMinutes(punch("09:00", "10:00", 120)), 0);
});

/* ------------------------------------------------------------------ */
/* 법정 휴게 (근로기준법 제54조)                                        */
/* ------------------------------------------------------------------ */

test("requiredBreak: 4시간 30분 / 8시간 60분", () => {
  assert.equal(requiredBreak(239), 0);
  assert.equal(requiredBreak(240), 30);
  assert.equal(requiredBreak(479), 30);
  assert.equal(requiredBreak(480), 60);
  assert.equal(requiredBreak(600), 60);
});

/* ------------------------------------------------------------------ */
/* 하루 판정                                                            */
/* ------------------------------------------------------------------ */

test("정시 출근은 정상", () => {
  const r = judgeDay("2026-09-04", "오픈조", punch("07:30", "15:30", 30), SHIFTS);
  assert.equal(r.status, "정상");
  assert.equal(r.lateMin, 0);
  assert.equal(r.workedMin, 450);
});

test("5분까지는 지각으로 세지 않는다", () => {
  // 1~2분 차이로 지각이 붙으면 아무도 안 쓴다
  assert.equal(judgeDay("2026-09-04", "오픈조", punch("07:35", "15:30"), SHIFTS).status, "정상");
  assert.equal(judgeDay("2026-09-04", "오픈조", punch("07:36", "15:30"), SHIFTS).status, "지각");
  assert.equal(judgeDay("2026-09-04", "오픈조", punch("07:50", "15:30"), SHIFTS).lateMin, 20);
});

test("근무표에 있는데 기록이 없으면 결근", () => {
  assert.equal(judgeDay("2026-09-04", "오픈조", null, SHIFTS).status, "결근");
});

test("근무표에 없고 기록도 없으면 휴무", () => {
  assert.equal(judgeDay("2026-09-04", "", null, SHIFTS).status, "휴무");
});

test("휴무인데 출근했으면 버리지 않는다 (추가근무다)", () => {
  const r = judgeDay("2026-09-04", "", punch("09:00", "13:00"), SHIFTS);
  assert.notEqual(r.status, "휴무");
  assert.equal(r.workedMin, 240);
});

test("퇴근 전이면 근무중", () => {
  const r = judgeDay("2026-09-04", "오픈조", punch("07:30", ""), SHIFTS);
  assert.equal(r.status, "근무중");
  assert.equal(r.workedMin, null);
});

test("1일 8시간을 넘으면 연장으로 센다", () => {
  const r = judgeDay("2026-09-04", "오픈조", punch("07:00", "18:00", 60), SHIFTS);
  assert.equal(r.workedMin, 600);
  assert.equal(r.overtimeMin, 120);
});

test("법정 휴게가 모자라면 표시한다", () => {
  // 9시간 구속인데 휴게 30분 → 60분 필요
  assert.equal(judgeDay("2026-09-04", "오픈조", punch("09:00", "18:00", 30), SHIFTS).breakShort, true);
  assert.equal(judgeDay("2026-09-04", "오픈조", punch("09:00", "18:00", 60), SHIFTS).breakShort, false);
});

/* ------------------------------------------------------------------ */
/* 인건비 (추정)                                                        */
/* ------------------------------------------------------------------ */

function days(list: Array<[number, number]>): DayResult[] {
  return list.map(([workedMin, overtimeMin], i) => ({
    date: `2026-09-0${i + 1}`,
    planned: "오픈조",
    punch: null,
    workedMin,
    overtimeMin,
    lateMin: 0,
    status: "정상" as const,
    breakShort: false,
  }));
}

test("기본급 = 실근로시간 × 시급", () => {
  const p = estimatePay(days([[480, 0]]), {
    hourlyWage: 10_320,
    fiveOrMore: false,
    contractWeeklyHours: 8,
  });
  assert.equal(Math.round(p.basePay), 82_560); // 8시간 × 10,320
});

test("★ 5인 미만이면 연장 가산이 붙지 않는다 (근로기준법 제11조)", () => {
  const d = days([[600, 120]]);
  const small = estimatePay(d, { hourlyWage: 10_000, fiveOrMore: false, contractWeeklyHours: 10 });
  const big = estimatePay(d, { hourlyWage: 10_000, fiveOrMore: true, contractWeeklyHours: 10 });

  assert.equal(small.overtimePay, 0);
  // 2시간 연장 × 10,000 × 0.5 = 10,000
  assert.equal(Math.round(big.overtimePay), 10_000);
  assert.equal(big.total - small.total, 10_000);
});

test("주 15시간 미만이면 주휴수당이 없다 (제18조 제3항)", () => {
  const p = estimatePay(days([[600, 0]]), {
    hourlyWage: 10_320,
    fiveOrMore: false,
    contractWeeklyHours: 10,
  });
  assert.equal(p.weeklyEligible, false);
  assert.equal(p.holidayPay, 0);
});

test("주 15시간 이상이면 소정근로시간에 비례해 주휴가 붙는다 (제55조)", () => {
  const p = estimatePay(days([[480, 0], [480, 0]]), {
    hourlyWage: 10_000,
    fiveOrMore: false,
    contractWeeklyHours: 20,
  });
  assert.equal(p.weeklyEligible, true);
  // (20 / 40) × 8 × 10,000 = 40,000
  assert.equal(Math.round(p.holidayPay), 40_000);
});

test("소정근로시간이 40시간을 넘어도 주휴는 8시간분이 상한", () => {
  const p = estimatePay(days([[2880, 0]]), {
    hourlyWage: 10_000,
    fiveOrMore: true,
    contractWeeklyHours: 48,
  });
  assert.equal(Math.round(p.holidayPay), 80_000); // 8시간 × 10,000
});

test("계약서에 소정근로시간이 없으면 실근로시간으로 대신한다", () => {
  const p = estimatePay(days([[1200, 0]]), {
    hourlyWage: 10_000,
    fiveOrMore: false,
    contractWeeklyHours: null,
  });
  assert.equal(p.weeklyEligible, true); // 20시간
  assert.equal(Math.round(p.holidayPay), 40_000);
});

test("퇴근 안 찍은 날(null)이 섞여도 합계가 깨지지 않는다", () => {
  const list: DayResult[] = [
    ...days([[480, 0]]),
    { date: "x", planned: "", punch: null, workedMin: null, overtimeMin: 0, lateMin: 0, status: "근무중", breakShort: false },
  ];
  const p = estimatePay(list, { hourlyWage: 10_000, fiveOrMore: false, contractWeeklyHours: 8 });
  assert.equal(p.workedMin, 480);
  assert.equal(Number.isFinite(p.total), true);
});

test("hoursLabel", () => {
  assert.equal(hoursLabel(450), "7시간 30분");
  assert.equal(hoursLabel(480), "8시간");
  assert.equal(hoursLabel(45), "45분");
  assert.equal(hoursLabel(0), "0분");
});

/* ------------------------------------------------------------------ *
 * 조가 지금 정말 일하고 있는가 (shiftPunchStates)
 *
 * ★ 홈 화면의 「근무 중」이 근무조 시간표로 붙던 것을 고친 자리다.
 *   예정 시간으로 판정하면 아무도 안 온 날에도 붙는다.
 * ------------------------------------------------------------------ */

const T = "2026-09-13";
const Y = "2026-09-12";

function pu(staffId: string, date: string, inAt: string, outAt = ""): Punch {
  return { id: "x", staffId, date, inAt, outAt, breakMin: 0, note: "" };
}

test("★ 아무도 안 찍었으면 그 조는 아예 안 나온다 (「근무 중」이 안 붙는다)", () => {
  const st = shiftPunchStates({ s1: { [T]: "제빵" } }, {}, [T, Y]);
  assert.equal(st["제빵"], undefined);
});

test("출근만 찍었으면 근무 중", () => {
  const st = shiftPunchStates(
    { s1: { [T]: "오픈조" } },
    { s1: { [T]: pu("s1", T, "07:28") } },
    [T, Y],
  );
  assert.equal(st["오픈조"].working, 1);
  assert.equal(st["오픈조"].finished, 0);
  assert.equal(st["오픈조"].firstIn, "07:28");
  assert.equal(st["오픈조"].workedMin, null);
});

test("퇴근을 찍으면 근무 중이 떨어지고 일한 시간이 남는다", () => {
  const st = shiftPunchStates(
    { s1: { [T]: "오픈조" } },
    { s1: { [T]: pu("s1", T, "07:28", "15:40") } },
    [T, Y],
  );
  assert.equal(st["오픈조"].working, 0);
  assert.equal(st["오픈조"].finished, 1);
  assert.equal(st["오픈조"].workedMin, 492); // 8시간 12분
});

test("★ 예정 시간을 넘겨 일해도 찍은 대로 센다 — 제빵 05:00~13:00 을 14:10 까지", () => {
  const st = shiftPunchStates(
    { s1: { [T]: "제빵" } },
    { s1: { [T]: pu("s1", T, "04:55", "14:10") } },
    [T, Y],
  );
  assert.equal(st["제빵"].workedMin, 555); // 9시간 15분. 예정 8시간이 아니다
});

test("한 조에 둘이 찍히면 사람 수와 합계가 같이 쌓인다", () => {
  const st = shiftPunchStates(
    { s1: { [T]: "마감조" }, s2: { [T]: "마감조" } },
    {
      s1: { [T]: pu("s1", T, "14:30", "22:30") },
      s2: { [T]: pu("s2", T, "14:40") },
    },
    [T, Y],
  );
  assert.equal(st["마감조"].working, 1);
  assert.equal(st["마감조"].finished, 1);
  assert.equal(st["마감조"].firstIn, "14:30");
  assert.equal(st["마감조"].workedMin, 480);
});

test("★ 자정을 넘긴 마감조가 새벽에도 근무 중으로 남는다", () => {
  // 어제 23:00 에 찍고 아직 안 나갔다. 오늘 날짜만 보면 사라진다
  const st = shiftPunchStates(
    { s1: { [Y]: "마감조" } },
    { s1: { [Y]: pu("s1", Y, "23:00") } },
    [T, Y],
  );
  assert.equal(st["마감조"].working, 1);
});

test("★ 어제 퇴근까지 찍고 끝난 조는 오늘 화면에 안 남는다", () => {
  const st = shiftPunchStates(
    { s1: { [Y]: "마감조" } },
    { s1: { [Y]: pu("s1", Y, "14:30", "22:30") } },
    [T, Y],
  );
  assert.equal(st["마감조"], undefined);
});

test("휴무(빈 문자열)는 세지 않는다", () => {
  const st = shiftPunchStates(
    { s1: { [T]: "" } },
    { s1: { [T]: pu("s1", T, "07:00") } },
    [T, Y],
  );
  assert.deepEqual(st, {});
});
