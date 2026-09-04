/* ------------------------------------------------------------------ *
 * 원가.
 *
 * 새로 만드는 데이터가 거의 없다. 레시피에 이미 재료와 수량(g·ml)이
 * 들어 있고, 거래처에 단가가 있다. 둘을 곱하면 끝이다.
 * 레시피를 배수로 계산하려고 넣어둔 `amount`가 그대로 원가의 재료가 된다.
 *
 * ★ 한 가지만 고집한다: 값을 못 구한 재료는 0원으로 세지 않는다.
 *
 * 재료 여섯 개 중 둘의 단가를 아직 안 넣었는데 원가율 18%라고 뜨면,
 * 사장님은 그 숫자를 믿고 가격을 정한다. 그래서 "몇 개를 못 구했다"를
 * 항상 같이 돌려주고, 화면은 그걸 반드시 보여준다.
 * ------------------------------------------------------------------ */

import type { Recipe } from "./types.ts";
import { unitPrice, findItemByName, type VendorItem } from "./vendors.ts";
import { familyLabel } from "./units.ts";

export type LineCost = {
  name: string;
  amount: number;
  unit: string;
  /** 이 재료에 든 돈 (원). 못 구했으면 null */
  cost: number | null;
  /** 왜 못 구했는지 — 화면에 그대로 띄운다 */
  problem: string | null;
  /** 어느 품목에서 값을 가져왔는지 */
  itemId: string | null;
  /** 일부러 원가에 안 세는 재료 (수돗물, 그리고 "추출량" 같은 결과값) */
  excluded: boolean;
};

export type RecipeCost = {
  lines: LineCost[];
  /** 1배합 전체 재료비 (원). 못 구한 건 빼고 더한 값이다 */
  total: number;
  /** 값을 못 구한 재료 수. 0이 아니면 total은 실제보다 적다 */
  missing: number;
  /** 1개(1잔)당 재료비 */
  perUnit: number;
};

/**
 * 레시피 하나의 원가.
 *
 * `yield.amount`로 나눠서 1잔·1개당 값을 낸다. 1배합에 식빵 6개가
 * 나오는데 배합 전체 원가만 보여주면 판매가와 비교할 수가 없다.
 */
export function costOfRecipe(
  recipe: Recipe,
  items: VendorItem[],
  /** 원가에 세지 않을 재료 이름 */
  excluded: string[] = [],
): RecipeCost {
  const skip = new Set(excluded.map((n) => n.trim()));

  const lines: LineCost[] = recipe.ingredients.map((ing) => {
    // 제외 재료는 단가를 찾지도 않는다. missing으로 세면 "채우세요"가
    // 계속 떠서, 사람이 결국 채우고 원가가 틀어진다.
    if (skip.has(ing.name.trim())) {
      return {
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit,
        cost: 0,
        problem: null,
        itemId: null,
        excluded: true,
      };
    }

    const item = findItemByName(items, ing.name);

    if (!item) {
      return {
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit,
        cost: null,
        problem: "거래처에 단가가 없습니다",
        itemId: null,
        excluded: false,
      };
    }

    const per = unitPrice(item, ing.unit);
    if (per === null) {
      return {
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit,
        cost: null,
        // 왜 안 되는지 정확히 말해준다. "오류"라고만 하면 못 고친다
        problem: `단위가 안 맞습니다 (레시피 ${familyLabel(
          ing.unit,
        )} · 거래처 ${familyLabel(item.packUnit)})`,
        itemId: item.id,
        excluded: false,
      };
    }

    return {
      name: ing.name,
      amount: ing.amount,
      unit: ing.unit,
      cost: per * ing.amount,
      problem: null,
      itemId: item.id,
      excluded: false,
    };
  });

  const total = lines.reduce((s, l) => s + (l.cost ?? 0), 0);
  const missing = lines.filter((l) => l.cost === null).length;
  const y = recipe.yield.amount > 0 ? recipe.yield.amount : 1;

  return { lines, total, missing, perUnit: total / y };
}

/**
 * 원가율 (%).
 *
 * 판매가가 없으면 null. 0으로 나눠서 Infinity를 화면에 띄우면 안 된다.
 * 값을 못 구한 재료가 있으면 이 값은 **실제보다 낮게** 나온다는 걸
 * 부르는 쪽이 알고 있어야 한다.
 */
export function costRate(perUnit: number, price: number): number | null {
  if (!(price > 0) || !Number.isFinite(perUnit)) return null;
  return (perUnit / price) * 100;
}

/**
 * 목표 원가율에 맞추려면 얼마에 팔아야 하는가.
 *
 * 카페는 보통 30% 안쪽을 본다. 사장님이 가격을 정할 때 실제로 쓰는
 * 방향은 "원가에서 가격 뽑기"라 역산이 있어야 쓸모가 있다.
 * 100원 단위로 올림한다 — 4,730원짜리 메뉴판은 없다.
 */
export function suggestedPrice(perUnit: number, targetRate: number): number | null {
  if (!(targetRate > 0) || !Number.isFinite(perUnit) || perUnit <= 0) return null;
  const raw = perUnit / (targetRate / 100);
  return Math.ceil(raw / 100) * 100;
}
