/* ------------------------------------------------------------------ *
 * 매장 설정.
 *
 * 여기 있는 값들은 화면 여러 개가 같이 쓴다. 흩어놓으면
 * 원가 화면의 판매가와 매출 화면의 판매가가 달라진다.
 * ------------------------------------------------------------------ */

import { loadJson, saveJson } from "./store.ts";

export type Settings = {
  /**
   * 최저임금 시급.
   *
   * 2026년 적용액은 10,320원(고용노동부 고시)이다. 코드에 박지 않고
   * 기본값으로만 두는 이유는 해마다 바뀌기 때문이다 —
   * 박아두면 내년에 조용히 틀린 경고를 준다.
   */
  minWage: number;
  /**
   * 상시 근로자 5명 이상인가.
   * 연장 가산수당(근로기준법 제56조) 적용 여부가 갈린다.
   * 개인 카페는 대부분 5인 미만이라 기본값은 false.
   */
  fiveOrMore: boolean;
  /** 목표 원가율(%). 카페는 보통 30% 안쪽을 본다 */
  targetCostRate: number;
  /** 레시피별 판매가. key는 Recipe.id */
  prices: Record<string, number>;
  /**
   * 원가에 세지 않는 재료 이름.
   *
   * 두 종류가 여기 들어온다.
   *   1) 살 수 없는 것 — 수돗물·정수
   *   2) ★ 결과값 — 아메리카노 레시피의 "추출량 36g"이 그렇다.
   *      그건 사는 재료가 아니라 원두 18g이 나온 결과다. 여기에 단가를
   *      붙이면 **원두 값이 두 번 계산된다.** 화면이 "단가를 채우세요"라고
   *      권하고 있었으므로 실제로 틀릴 수 있는 길이었다.
   *
   * 못 구한 재료(missing)와 구분해야 한다 — 이쪽은 0원이 맞다.
   */
  excluded: string[];
  /**
   * 한 달 고정비 합계 — 임대료 · 공과금 · 카드수수료 · 보험 · 통신 등.
   *
   * ★ 이걸 넣어야 「순익」이 **진짜 순익**이 된다 (2026-09-12).
   *   전에는 매출 − 재료비 − 인건비만 보고 「남은 돈」이라고 불렀는데,
   *   그 값으로 가격을 정하면 실제보다 낙관적이다.
   *
   * ⚠️ **0 은 «없음» 이 아니라 «아직 안 넣음» 이다.** 0 으로 두고 빼면
   *   화면이 조용히 옛날 값을 «순익» 이라고 부르게 된다 —
   *   못 구한 재료 단가를 0원으로 세지 않는 것과 같은 규칙이다.
   *   그래서 `profitOf` 는 0 일 때 **안 뺀 것을 사실대로 말한다.**
   */
  monthlyFixed: number;
  /**
   * 한 달에 며칠 여는가. 고정비를 하루치로 나눌 때 쓴다.
   * 주 6일이면 26, 연중무휴면 30. 기본값은 26.
   */
  openDaysPerMonth: number;
};

const KEY = "sop:settings";

export const DEFAULTS: Settings = {
  minWage: 10_320,
  fiveOrMore: false,
  targetCostRate: 30,
  prices: {},
  excluded: [],
  monthlyFixed: 0,
  openDaysPerMonth: 26,
};

export function loadSettings(): Settings {
  const s = loadJson<Partial<Settings>>(KEY, {});
  return {
    minWage: typeof s.minWage === "number" ? s.minWage : DEFAULTS.minWage,
    fiveOrMore: s.fiveOrMore === true,
    targetCostRate:
      typeof s.targetCostRate === "number" && s.targetCostRate > 0
        ? s.targetCostRate
        : DEFAULTS.targetCostRate,
    prices: s.prices && typeof s.prices === "object" ? s.prices : {},
    excluded: Array.isArray(s.excluded) ? s.excluded : [],
    monthlyFixed:
      typeof s.monthlyFixed === "number" && s.monthlyFixed > 0 ? s.monthlyFixed : 0,
    openDaysPerMonth:
      typeof s.openDaysPerMonth === "number" && s.openDaysPerMonth > 0
        ? s.openDaysPerMonth
        : DEFAULTS.openDaysPerMonth,
  };
}

export function saveSettings(s: Settings): boolean {
  return saveJson(KEY, s);
}
