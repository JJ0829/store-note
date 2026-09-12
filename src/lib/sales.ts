/* ------------------------------------------------------------------ *
 * 매출 보고.
 *
 * 이 화면 혼자서는 별 가치가 없다 — 매출은 포스기가 이미 알려준다.
 * 쓸모는 **빼기**에 있다.
 *
 *      매출 − 재료비 − 인건비 = 오늘 순익
 *
 * 재료비는 발주·거래처에서, 인건비는 출퇴근 기록에서 그냥 따라온다.
 * 사장님이 따로 계산기를 두드리던 걸 없애는 게 목적이다.
 *
 * 마감할 때 한 줄 넣는 것 이상을 요구하면 안 쓴다. 그래서 입력은
 * 매출·건수·재료비 셋뿐이고, 인건비는 안 물어본다(출퇴근에서 나온다).
 * ------------------------------------------------------------------ */

import { loadJson, saveJson } from "./store.ts";

export type DaySales = {
  /** YYYY-MM-DD */
  date: string;
  /** 총매출 (원, 부가세 포함 카드+현금 합계) */
  total: number;
  /** 결제 건수 — 객단가를 보려고 받는다 */
  count: number;
  /** 그날 나간 재료비 (원). 발주 금액을 그대로 적는 게 보통이다 */
  material: number;
  note: string;
};

export type SalesData = Record<string, DaySales>;

const KEY = "sop:sales";

export function loadSales(): SalesData {
  return loadJson<SalesData>(KEY, {});
}

export function saveSales(data: SalesData): boolean {
  return saveJson(KEY, data);
}

export function emptyDay(date: string): DaySales {
  return { date, total: 0, count: 0, material: 0, note: "" };
}

export function getDay(data: SalesData, date: string): DaySales {
  return data[date] ?? emptyDay(date);
}

/* ------------------------------------------------------------------ */

export type Profit = {
  sales: number;
  material: number;
  labor: number;
  /** 하루치 고정비 (월 고정비 ÷ 월 영업일수). 안 넣었으면 0 */
  fixed: number;
  /**
   * ★ **고정비를 아직 안 넣었는가.**
   *
   * 이 값이 `true` 면 `left` 는 순익이 **아니다** — 재료비·인건비만 뺀 것이다.
   * 화면은 이걸 보고 이름을 바꿔 불러야 한다. 0 을 «고정비 없음» 으로 읽고
   * 그냥 «순익» 이라고 부르면, 그 숫자로 가격을 정하는 사람이 손해를 본다.
   * (못 구한 재료 단가를 0원으로 세지 않는 것과 같은 규칙이다)
   */
  fixedMissing: boolean;
  /** 매출 − 재료비 − 인건비 − 고정비 */
  left: number;
  /** 객단가 */
  perCustomer: number | null;
};

/** 하루치 고정비. 월 영업일수로 나눈다 */
export function dailyFixed(monthlyFixed: number, openDaysPerMonth: number): number {
  const m = Math.max(0, monthlyFixed || 0);
  const d = Math.max(1, openDaysPerMonth || 1);
  return m === 0 ? 0 : Math.round(m / d);
}

/**
 * 하루 손익.
 *
 * ⚠ 고정비를 안 넣었으면 `fixedMissing: true` 다. 그때 `left` 는 순익이
 *   아니라 **재료비·인건비만 뺀 값**이고, 화면이 그렇게 말해야 한다.
 */
export function profitOf(
  day: DaySales,
  laborCost: number,
  fixedPerDay = 0,
): Profit {
  const sales = day.total || 0;
  const material = day.material || 0;
  const labor = Math.max(0, laborCost || 0);
  const fixed = Math.max(0, fixedPerDay || 0);
  return {
    sales,
    material,
    labor,
    fixed,
    fixedMissing: fixed === 0,
    left: sales - material - labor - fixed,
    perCustomer: day.count > 0 ? sales / day.count : null,
  };
}

/** 기간 합계. 주간·월간 보기에 쓴다 */
export function sumRange(data: SalesData, dates: string[]): DaySales {
  return dates.reduce<DaySales>(
    (acc, d) => {
      const day = data[d];
      if (!day) return acc;
      return {
        date: acc.date,
        total: acc.total + (day.total || 0),
        count: acc.count + (day.count || 0),
        material: acc.material + (day.material || 0),
        note: "",
      };
    },
    { date: dates[0] ?? "", total: 0, count: 0, material: 0, note: "" },
  );
}
