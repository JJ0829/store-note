/* ------------------------------------------------------------------ *
 * 근무조가 지금 근무 중인가.
 *
 * ★ 자정을 넘는 근무조가 있다. 마감조는 17:00 에 시작해 **다음날 01:00** 에
 *   끝난다 (영업이 새벽 1시까지다 — 사장님 확인 2026-09-09).
 *
 *   원래 판정은 이랬다:
 *       cur >= toMin(start) && cur < toMin(end)
 *
 *   `17:00~01:00` 이면 start=1020, end=60 이라 **이 조건이 절대 참이 안 된다.**
 *   18:00 에도(1080 < 60 거짓) 00:30 에도(30 >= 1020 거짓) 안 잡힌다.
 *   → **마감조가 홈 화면에서 영영 안 뜬다.** 정작 마감조가 이 앱을 가장
 *     많이 여는 조인데 그렇다.
 *
 *   이 프로젝트는 같은 성격의 문제를 두 번 풀었다 —
 *   `attendance.workedMinutes()`(퇴근이 출근보다 이른 경우)와
 *   `businessDay()`(체크 키의 하루 경계). 여기가 세 번째다.
 *
 * → docs/deliverables/19_정책정의서.md §3.2
 * ------------------------------------------------------------------ */

import { toMin } from "./attendance.ts";

export type ShiftTime = { start: string; end: string };

/** 하루 분(0~1439). `now` 의 시:분 */
export function minutesOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** `17:00~01:00` 처럼 끝이 시작보다 이른 근무조 */
export function crossesMidnight(s: ShiftTime): boolean {
  const a = toMin(s.start);
  const b = toMin(s.end);
  if (a === null || b === null) return false;
  return b <= a;
}

/**
 * 지금 이 조가 근무 중인가.
 *
 * 끝이 시작보다 이르면 **자정을 넘는 것으로 보고 두 구간으로 나눈다** —
 * `[start, 24:00)` 과 `[00:00, end)`.
 *
 * 시각이 깨져 있으면(`toMin` 이 `null`) **근무 중이 아니라고 본다.**
 * 여기서 관대하게 굴면 엉뚱한 조가 홈 첫 화면에 뜬다.
 */
export function isOnDuty(s: ShiftTime, cur: number): boolean {
  const a = toMin(s.start);
  const b = toMin(s.end);
  if (a === null || b === null) return false;
  if (b > a) return cur >= a && cur < b; // 보통 조
  if (b === a) return false; // 길이 0. 잘못 입력된 것으로 본다
  return cur >= a || cur < b; // 자정을 넘는 조
}

/**
 * 지금 근무 중인 조들. **방금 시작한 조가 앞**이다.
 *
 * 겹치는 시간대에 시드 등록 순서로 두면 07:30 에 제빵(05:00 시작)이 먼저 떠서,
 * 그 시각에 막 출근한 오픈조가 자기 화면을 아래에서 찾아야 한다.
 *
 * ⚠️ 자정을 넘는 조는 **새벽에 "가장 늦게 시작한 조"로 잡히면 안 된다.**
 * 00:30 의 마감조는 어제 17:00 에 시작한 것이므로, 그 시각 기준으로는
 * 이미 한참 전에 시작한 조다. 그래서 자정을 넘긴 상태면 시작 분에서
 * 하루(1440)를 빼서 비교한다.
 */
export function onDutyNow<T extends ShiftTime>(shifts: T[], cur: number): T[] {
  const startedAt = (s: ShiftTime): number => {
    const a = toMin(s.start) ?? 0;
    // 자정을 넘는 조이고 지금이 새벽이면, 그 조는 "어제" 시작했다
    return crossesMidnight(s) && cur < a ? a - 1440 : a;
  };
  return shifts
    .filter((s) => isOnDuty(s, cur))
    .sort((x, y) => startedAt(y) - startedAt(x));
}

/**
 * 근무 시간이 아닐 때 알려줄 다음 조.
 *
 * 오늘 남은 조 중 가장 이른 것. 없으면 **내일 가장 이른 조**로 넘어간다
 * (예전에는 `shifts[0]` — 시드 등록 순서 — 로 떨어져서 엉뚱한 조를 알려줬다).
 */
export function nextShift<T extends ShiftTime>(shifts: T[], cur: number): T | null {
  if (shifts.length === 0) return null;
  const withMin = shifts
    .map((s) => ({ s, m: toMin(s.start) }))
    .filter((x): x is { s: T; m: number } => x.m !== null);
  if (withMin.length === 0) return null;

  const later = withMin.filter((x) => x.m > cur).sort((a, b) => a.m - b.m);
  if (later.length > 0) return later[0].s;

  return withMin.sort((a, b) => a.m - b.m)[0].s; // 내일 첫 조
}
