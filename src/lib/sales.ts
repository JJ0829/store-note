/* ------------------------------------------------------------------ *
 * 매출 보고.
 *
 * 이 화면 혼자서는 별 가치가 없다 — 매출은 포스기가 이미 알려준다.
 * 쓸모는 **빼기**에 있다.
 *
 *      매출 − 재료비 − 인건비 = 오늘 남은 돈
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
  /** 매출 − 재료비 − 인건비. 임대료·공과금은 안 들어 있다 */
  left: number;
  /** 객단가 */
  perCustomer: number | null;
};

/**
 * 하루 손익.
 *
 * ⚠ `left`는 순이익이 아니다. 임대료·공과금·카드수수료·세금이 빠져 있다.
 *   화면에 "남은 돈"이라고만 쓰고 순이익이라고 쓰지 않는 이유다.
 */
export function profitOf(
  day: DaySales,
  laborCost: number,
): Profit {
  const sales = day.total || 0;
  const material = day.material || 0;
  const labor = Math.max(0, laborCost || 0);
  return {
    sales,
    material,
    labor,
    left: sales - material - labor,
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
