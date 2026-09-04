/* ------------------------------------------------------------------ *
 * 원가.
 *
 * 가장 위험한 실패는 "틀린 숫자"가 아니라 "그럴듯한 숫자"다.
 * 재료 여섯 중 둘의 단가가 없는데 원가율 18%가 뜨면 사장님은 그걸 믿고
 * 가격을 정한다. missing이 반드시 같이 나와야 하는 이유다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import { costOfRecipe, costRate, suggestedPrice } from "../src/lib/cost.ts";
import type { VendorItem } from "../src/lib/vendors.ts";
import type { Recipe } from "../src/lib/types.ts";

function item(
  name: string,
  packAmount: number,
  packUnit: string,
  packPrice: number,
): VendorItem {
  return {
    id: "vi-" + name,
    vendorId: "vd-1",
    name,
    packAmount,
    packUnit,
    packPrice,
    note: "",
  };
}

function recipe(
  ingredients: Array<{ name: string; amount: number; unit: string }>,
  yieldAmount = 1,
): Recipe {
  return {
    id: "r1",
    slug: "r1",
    name: "테스트",
    category: "음료",
    yield: { amount: yieldAmount, unit: "잔" },
    ingredients: ingredients.map((i) => ({ ...i, note: null })),
    sections: [],
    forNewbie: false,
  };
}

/* ------------------------------------------------------------------ */

test("원두 1kg 28,000원 → 18g 쓰면 504원", () => {
  const r = recipe([{ name: "원두", amount: 18, unit: "g" }]);
  const c = costOfRecipe(r, [item("원두", 1, "kg", 28_000)]);
  assert.equal(c.missing, 0);
  assert.equal(Math.round(c.total), 504);
  assert.equal(Math.round(c.perUnit), 504);
});

test("우유 1000ml 1,300원 → 150ml 쓰면 195원", () => {
  const r = recipe([{ name: "우유", amount: 150, unit: "ml" }]);
  const c = costOfRecipe(r, [item("우유", 1000, "ml", 1300)]);
  assert.equal(Math.round(c.total), 195);
});

test("1배합이 6개 나오면 1개당으로 나눈다", () => {
  // 식빵 1배합 = 강력분 2000g. 밀가루 20kg 34,000원이면 3,400원.
  const r = recipe([{ name: "강력분", amount: 2000, unit: "g" }], 6);
  const c = costOfRecipe(r, [item("강력분", 20, "kg", 34_000)]);
  assert.equal(Math.round(c.total), 3400);
  assert.equal(Math.round(c.perUnit), 567); // 3400 / 6
});

/* ------------------------------------------------------------------ */
/* 못 구한 값을 0원으로 세지 않는다                                     */
/* ------------------------------------------------------------------ */

test("단가가 없는 재료는 missing으로 센다", () => {
  const r = recipe([
    { name: "원두", amount: 18, unit: "g" },
    { name: "물", amount: 200, unit: "ml" },
  ]);
  const c = costOfRecipe(r, [item("원두", 1, "kg", 28_000)]);
  assert.equal(c.missing, 1);
  assert.equal(c.lines[1].cost, null);
  assert.match(c.lines[1].problem ?? "", /단가가 없습니다/);
  // 못 구한 건 빼고 더한다. 0원으로 세지 않는다
  assert.equal(Math.round(c.total), 504);
});

test("계열이 다른 단위는 계산하지 않고 이유를 말한다", () => {
  // 레시피는 200ml인데 거래처는 kg으로 판다
  const r = recipe([{ name: "생크림", amount: 200, unit: "ml" }]);
  const c = costOfRecipe(r, [item("생크림", 1, "kg", 9000)]);
  assert.equal(c.missing, 1);
  assert.equal(c.total, 0);
  assert.match(c.lines[0].problem ?? "", /단위가 안 맞습니다/);
  assert.match(c.lines[0].problem ?? "", /부피/);
  assert.match(c.lines[0].problem ?? "", /무게/);
});

test("이름 앞뒤 공백은 무시하지만 다른 이름은 안 붙인다", () => {
  const r = recipe([{ name: " 우유 ", amount: 100, unit: "ml" }]);
  assert.equal(costOfRecipe(r, [item("우유", 1000, "ml", 1300)]).missing, 0);
  // "멸균우유"를 "우유"로 보면 원가가 틀린다
  assert.equal(costOfRecipe(r, [item("멸균우유", 1000, "ml", 900)]).missing, 1);
});

test("packAmount가 0이면 나눗셈을 하지 않는다", () => {
  const r = recipe([{ name: "원두", amount: 18, unit: "g" }]);
  const c = costOfRecipe(r, [item("원두", 0, "kg", 28_000)]);
  assert.equal(c.missing, 1);
  assert.equal(Number.isFinite(c.total), true);
});

/* ------------------------------------------------------------------ */

test("costRate: 판매가가 없으면 null (Infinity를 띄우면 안 된다)", () => {
  assert.equal(costRate(504, 0), null);
  assert.equal(costRate(504, -100), null);
  assert.equal(Math.round(costRate(504, 4500) ?? 0), 11);
});

test("suggestedPrice: 목표 원가율에서 역산하고 100원 단위로 올린다", () => {
  // 원가 504원, 목표 30% → 1680원 → 1700원
  assert.equal(suggestedPrice(504, 30), 1700);
  assert.equal(suggestedPrice(0, 30), null);
  assert.equal(suggestedPrice(504, 0), null);
});

/* ------------------------------------------------------------------ */
/* 원가에 세지 않는 재료                                                */
/*                                                                      */
/* 아메리카노 시드는 "원두(도징) 18g"과 "추출량 36g"을 둘 다 갖고 있다.  */
/* 추출량은 사는 재료가 아니라 원두가 나온 결과다. 여기에 단가를 붙이면  */
/* 원두 값이 두 번 계산된다 — 화면이 "단가를 채우세요"라고 권하고 있어서 */
/* 실제로 밟을 수 있는 길이었다.                                        */
/* ------------------------------------------------------------------ */

test("★ 제외한 재료는 0원으로 세고 missing에 넣지 않는다", () => {
  const r = recipe([
    { name: "원두 (도징)", amount: 18, unit: "g" },
    { name: "추출량", amount: 36, unit: "g" },
    { name: "물", amount: 200, unit: "ml" },
  ]);
  const items = [item("원두 (도징)", 1, "kg", 28_000)];
  const c = costOfRecipe(r, items, ["추출량", "물"]);

  assert.equal(c.missing, 0, "제외한 재료는 '못 구한 것'이 아니다");
  assert.equal(Math.round(c.total), 504, "원두 값만 세야 한다");
  assert.equal(c.lines[1].excluded, true);
  assert.equal(c.lines[1].cost, 0);
  assert.equal(c.lines[1].problem, null);
});

test("★ 제외하지 않으면 원두가 두 번 계산된다 (제외가 필요한 이유)", () => {
  const r = recipe([
    { name: "원두 (도징)", amount: 18, unit: "g" },
    { name: "추출량", amount: 36, unit: "g" },
  ]);
  // 사장님이 "추출량"에도 원두 단가를 붙여버린 상황
  const items = [
    item("원두 (도징)", 1, "kg", 28_000),
    item("추출량", 1, "kg", 28_000),
  ];
  assert.equal(Math.round(costOfRecipe(r, items).total), 1512); // 504 + 1008
  assert.equal(Math.round(costOfRecipe(r, items, ["추출량"]).total), 504);
});

test("제외 목록의 앞뒤 공백은 무시한다", () => {
  const r = recipe([{ name: "물", amount: 200, unit: "ml" }]);
  assert.equal(costOfRecipe(r, [], [" 물 "]).lines[0].excluded, true);
});

test("제외 목록을 안 넘겨도 예전처럼 동작한다", () => {
  const r = recipe([{ name: "원두", amount: 18, unit: "g" }]);
  const c = costOfRecipe(r, [item("원두", 1, "kg", 28_000)]);
  assert.equal(c.lines[0].excluded, false);
  assert.equal(Math.round(c.total), 504);
});

test("제외한 재료만 있으면 원가는 0원이고 경고도 없다", () => {
  const r = recipe([{ name: "물", amount: 200, unit: "ml" }]);
  const c = costOfRecipe(r, [], ["물"]);
  assert.equal(c.total, 0);
  assert.equal(c.missing, 0);
  assert.equal(c.perUnit, 0);
});
