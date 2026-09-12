/* ------------------------------------------------------------------ *
 * 출퇴근 기록과 근태.
 *
 * 근무표는 이미 있다. 그건 **계획**이다.
 * 출퇴근은 **실제**다. 근태는 그 둘의 차이다 — 새 개념이 아니라 뺄셈이다.
 *
 *   근무표 assign[staffId][날짜] = "오픈조"   ← 계획
 *   punch  [staffId][날짜] = 07:28 ~ 15:40   ← 실제
 *   차이   = 지각 / 결근 / 연장
 *
 * 그리고 이 기록이 인건비로 그대로 이어진다.
 * 계약서(시급) × 출퇴근(시간) = 인건비 → 매출에서 빼면 순수익.
 *
 * ────────────────────────────────────────────────────────────────
 * ⚠ 여기 나오는 금액은 **추정**이다. 실제 급여 대장이 아니다.
 *   4대보험·소득세·수습감액·연차수당을 넣지 않았다.
 *   화면에도 그대로 적어둔다. 급여를 이 숫자로 지급하면 안 된다.
 * ------------------------------------------------------------------ */

import { loadJson, newId, saveJson } from "./store.ts";
import type { Shift } from "./types.ts";

export type Punch = {
  id: string;
  staffId: string;
  /** YYYY-MM-DD */
  date: string;
  /** "07:28". 비어 있으면 아직 출근 안 찍음 */
  inAt: string;
  /** "15:40". 비어 있으면 근무 중 */
  outAt: string;
  /** 휴게시간(분). 근로시간에서 뺀다 */
  breakMin: number;
  note: string;
};

/** `punches[staffId][날짜]` — 근무표 assign과 같은 모양으로 맞췄다 */
export type PunchData = Record<string, Record<string, Punch>>;

const KEY = "sop:punch";

export function loadPunches(): PunchData {
  return loadJson<PunchData>(KEY, {});
}

export function savePunches(data: PunchData): boolean {
  return saveJson(KEY, data);
}

export function getPunch(
  data: PunchData,
  staffId: string,
  date: string,
): Punch | null {
  return data[staffId]?.[date] ?? null;
}

export function putPunch(data: PunchData, p: Punch): PunchData {
  return { ...data, [p.staffId]: { ...(data[p.staffId] ?? {}), [p.date]: p } };
}

export function newPunch(staffId: string, date: string): Punch {
  return {
    id: newId("pu"),
    staffId,
    date,
    inAt: "",
    outAt: "",
    breakMin: 0,
    note: "",
  };
}

export function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

export function toMin(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

export function fromMin(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(
    m % 60,
  ).padStart(2, "0")}`;
}

/** 분 → "7시간 30분" */
export function hoursLabel(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0분";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

/* ------------------------------------------------------------------ */
/* 실근로시간                                                           */
/* ------------------------------------------------------------------ */

/**
 * 실제로 일한 분. 퇴근을 안 찍었으면 null(= 아직 근무 중).
 *
 * 자정을 넘기는 경우를 반드시 처리한다. 마감조가 23:00에 들어와
 * 다음 날 01:00에 나가면 `01:00 - 23:00 = -22시간`이 된다. 음수 근로시간이
 * 인건비로 들어가면 그날 인건비가 통째로 깎인다.
 */
export function workedMinutes(p: Punch): number | null {
  const a = toMin(p.inAt);
  const b = toMin(p.outAt);
  if (a === null || b === null) return null;
  const span = b >= a ? b - a : b + 1440 - a;
  return Math.max(0, span - Math.max(0, p.breakMin || 0));
}

/**
 * 근로기준법 제54조가 요구하는 최소 휴게시간(분).
 *   4시간 이상 → 30분, 8시간 이상 → 60분.
 * 여기서 말하는 "4시간"은 휴게를 빼기 **전** 구속시간 기준이다.
 */
export function requiredBreak(spanMin: number): number {
  if (spanMin >= 480) return 60;
  if (spanMin >= 240) return 30;
  return 0;
}

/** 휴게를 빼기 전 구속시간(분) */
export function spanMinutes(p: Punch): number | null {
  const a = toMin(p.inAt);
  const b = toMin(p.outAt);
  if (a === null || b === null) return null;
  return b >= a ? b - a : b + 1440 - a;
}

/* ------------------------------------------------------------------ */
/* 하루 판정                                                            */
/* ------------------------------------------------------------------ */

export type DayStatus =
  | "휴무"
  | "정상"
  | "지각"
  | "결근"
  | "근무중"
  | "기록없음";

export type DayResult = {
  date: string;
  /** 근무표에 잡힌 조 이름. ""이면 휴무 */
  planned: string;
  punch: Punch | null;
  /** 실근로시간(분). 퇴근 전이면 null */
  workedMin: number | null;
  /** 1일 8시간 초과분 */
  overtimeMin: number;
  /** 조 시작보다 늦게 찍은 분 */
  lateMin: number;
  status: DayStatus;
  /** 법정 휴게시간에 모자란다 */
  breakShort: boolean;
};

const DAY_LIMIT = 480; // 1일 8시간 (제50조)

/** 지각으로 세지 않는 여유. 1~2분 차이로 지각을 붙이면 아무도 안 쓴다 */
export const LATE_GRACE_MIN = 5;

export function judgeDay(
  date: string,
  planned: string,
  punch: Punch | null,
  shifts: Shift[],
): DayResult {
  const base = {
    date,
    planned,
    punch,
    workedMin: null as number | null,
    overtimeMin: 0,
    lateMin: 0,
    breakShort: false,
  };

  // 근무표에 없는 날 — 다만 기록이 있으면 그건 추가근무다. 버리면 안 된다
  if (!planned) {
    if (!punch || !punch.inAt) return { ...base, status: "휴무" };
  }

  if (!punch || !punch.inAt) {
    return { ...base, status: "결근" };
  }

  const worked = workedMinutes(punch);
  const span = spanMinutes(punch);

  // 지각 — 근무표의 조 이름으로 시작 시각을 찾는다
  const shift = shifts.find((s) => s.name === planned);
  const startMin = shift ? toMin(shift.start) : null;
  const inMin = toMin(punch.inAt);
  let lateMin = 0;
  if (startMin !== null && inMin !== null && inMin > startMin + LATE_GRACE_MIN) {
    lateMin = inMin - startMin;
  }

  if (worked === null) {
    return { ...base, status: "근무중", lateMin };
  }

  return {
    ...base,
    workedMin: worked,
    overtimeMin: Math.max(0, worked - DAY_LIMIT),
    lateMin,
    breakShort:
      span !== null && (punch.breakMin || 0) < requiredBreak(span),
    status: lateMin > 0 ? "지각" : "정상",
  };
}

/* ------------------------------------------------------------------ */
/* 인건비 (추정)                                                        */
/* ------------------------------------------------------------------ */

export type PayInput = {
  /** 시급 (원) */
  hourlyWage: number;
  /**
   * 상시 5명 이상인가.
   *
   * ★ 이 한 칸이 금액을 크게 바꾼다. 근로기준법 제11조에 따라
   *   상시 4명 이하 사업장에는 연장·야간·휴일 가산수당(제56조)이
   *   적용되지 않는다. 개인 카페는 대부분 5인 미만이라
   *   기본값을 "5인 미만"으로 두고, 켤 수 있게 한다.
   */
  fiveOrMore: boolean;
  /**
   * 주휴수당 계산에 쓰는 1주 소정근로시간.
   * 계약서에 적힌 값이 원칙이다. 없으면 그 주 실근로시간으로 대신한다.
   */
  contractWeeklyHours: number | null;
};

export type PayResult = {
  workedMin: number;
  overtimeMin: number;
  /** 실근로시간 × 시급 */
  basePay: number;
  /** 연장 가산분 (5인 이상일 때만. 0.5배) */
  overtimePay: number;
  /** 주휴수당 */
  holidayPay: number;
  total: number;
  /** 주휴수당이 붙는 조건(주 15시간)을 넘겼는가 */
  weeklyEligible: boolean;
};

const WEEK_FULL = 40; // 주 40시간 (제50조)
const HOLIDAY_GATE_HOURS = 15; // 주휴수당 발생 기준 (제55조)

/**
 * 한 주치 인건비 추정.
 *
 * 주휴수당은 (1주 소정근로시간 ÷ 40) × 8 × 시급으로 본다.
 * 소정근로시간이 40시간을 넘어도 주휴는 8시간분이 상한이다.
 */
export function estimatePay(days: DayResult[], input: PayInput): PayResult {
  const workedMin = days.reduce((s, d) => s + (d.workedMin ?? 0), 0);
  const overtimeMin = days.reduce((s, d) => s + d.overtimeMin, 0);
  const wage = Math.max(0, input.hourlyWage || 0);

  const basePay = (workedMin / 60) * wage;
  // 5인 미만이면 가산이 없다. 기본급에는 이미 들어가 있으므로 0.5배만 더한다
  const overtimePay = input.fiveOrMore ? (overtimeMin / 60) * wage * 0.5 : 0;

  const weekHours =
    input.contractWeeklyHours && input.contractWeeklyHours > 0
      ? input.contractWeeklyHours
      : workedMin / 60;

  const weeklyEligible = weekHours >= HOLIDAY_GATE_HOURS;
  const holidayPay = weeklyEligible
    ? (Math.min(weekHours, WEEK_FULL) / WEEK_FULL) * 8 * wage
    : 0;

  return {
    workedMin,
    overtimeMin,
    basePay,
    overtimePay,
    holidayPay,
    total: basePay + overtimePay + holidayPay,
    weeklyEligible,
  };
}

/**
 * 하루치 인건비 (추정).
 *
 * `estimatePay`와 따로 두는 이유는 **주휴수당**이다. 주휴는 한 주 단위로
 * 붙는 돈이라 하루에 나눠 넣으면 그날 인건비가 부풀고, 매출 화면의
 * "순수익"이 실제보다 적게 보인다. 그래서 여기는 기본급 + 연장 가산만 센다.
 */
export function dayLaborCost(
  day: DayResult,
  hourlyWage: number,
  fiveOrMore: boolean,
): number {
  const wage = Math.max(0, hourlyWage || 0);
  const worked = day.workedMin ?? 0;
  const base = (worked / 60) * wage;
  const premium = fiveOrMore ? (day.overtimeMin / 60) * wage * 0.5 : 0;
  return base + premium;
}
