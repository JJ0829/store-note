/* ------------------------------------------------------------------ *
 * 배수 계산.
 *
 * 왜 이걸 먼저 테스트하는가 — 여기서 나온 숫자를 보고 사람이 저울에
 * 재료를 올린다. 화면 숫자가 틀리면 반죽 한 판이 통째로 못 쓰게 되고,
 * 그건 다음 날 아침 빵이 없다는 뜻이다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import { SCALES, scaled } from "../src/lib/scale.ts";

test("SCALES는 화면 버튼 5개와 같다", () => {
  assert.deepEqual(SCALES, [0.5, 1, 1.5, 2, 3]);
});

test("1배는 입력값을 그대로 돌려준다 (항등성)", () => {
  // 이게 깨지면 아무것도 안 눌렀는데 숫자가 바뀐 것처럼 보인다.
  // 예전 코드는 toFixed(1)로 잘라서 2.55 → "2.5" 였다.
  for (const v of [18, 2000, 40, 0, 7.5, 2.55, 0.35, 1.05]) {
    assert.equal(scaled(v, 1), String(v), `${v}배 아님`);
  }
});

test("정수 결과에는 소수점을 붙이지 않는다", () => {
  assert.equal(scaled(18, 0.5), "9");
  assert.equal(scaled(2000, 0.5), "1000");
  assert.equal(scaled(18, 1.5), "27");
  assert.equal(scaled(40, 1.5), "60");
  assert.equal(scaled(20, 3), "60");
});

test("0.5배에서 홀수 g은 반올림하지 않는다", () => {
  // 7.5g의 절반은 3.75g다. 예전에는 3.8로 나와서 0.05g이 사라졌다.
  assert.equal(scaled(7.5, 0.5), "3.75");
  assert.equal(scaled(2.55, 0.5), "1.28"); // 1.275 → 소수 둘째 자리 반올림
});

test("부동소수 찌꺼기를 화면에 내보내지 않는다", () => {
  // 0.35 * 3 은 자바스크립트에서 1.0499999999999998이다
  assert.equal(scaled(0.35, 3), "1.05");
  assert.equal(scaled(2.55, 2), "5.1");
  assert.equal(scaled(0.35, 2), "0.7");
  assert.equal(scaled(1.1, 3), "3.3");
});

test("0은 0으로 나온다", () => {
  // RecipeForm이 빈 칸을 `Number(i.amount) || 0` 으로 받는다
  assert.equal(scaled(0, 3), "0");
  assert.equal(scaled(0, 0.5), "0");
});

test("숫자가 아닌 값이 들어와도 화면이 깨지지 않는다", () => {
  assert.equal(scaled(Number.NaN, 2), "0");
  assert.equal(scaled(Number.POSITIVE_INFINITY, 2), "0");
});

test("큰 수량도 지수 표기로 새지 않는다", () => {
  assert.equal(scaled(12000, 3), "36000");
});
