/* ------------------------------------------------------------------ *
 * 단위 환산.
 *
 * 여기가 틀리면 원가가 1000배 틀린다. 그런데 화면에는 그냥 숫자로
 * 보여서 사람이 알아채지 못한다 — 그래서 테스트가 유일한 방어선이다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import { convert, familyLabel, sameFamily } from "../src/lib/units.ts";

test("무게: g ↔ kg", () => {
  assert.equal(convert(1, "kg", "g"), 1000);
  assert.equal(convert(2000, "g", "kg"), 2);
  assert.equal(convert(500, "mg", "g"), 0.5);
});

test("부피: ml ↔ L", () => {
  assert.equal(convert(1, "L", "ml"), 1000);
  assert.equal(convert(2000, "ml", "L"), 2);
  assert.equal(convert(200, "cc", "ml"), 200);
});

test("대소문자·공백을 무시한다 (거래처 입력은 제각각이다)", () => {
  assert.equal(convert(1, "KG", "g"), 1000);
  assert.equal(convert(1, " kg ", "g"), 1000);
  assert.equal(convert(1, "L", "ML"), 1000);
});

test("한글 단위도 받는다", () => {
  assert.equal(convert(1, "킬로", "g"), 1000);
  assert.equal(convert(1, "리터", "ml"), 1000);
});

/* ------------------------------------------------------------------ */
/* ★ 가장 중요한 규칙 — 계열이 다르면 계산하지 않는다                   */
/* ------------------------------------------------------------------ */

test("무게와 부피는 서로 안 바꾼다 (밀도를 모른다)", () => {
  // 물이면 1:1이지만 밀가루는 0.55, 오일은 0.92다.
  // 여기서 1을 돌려주면 원가가 조용히 두 배 가까이 틀린다.
  assert.equal(convert(100, "g", "ml"), null);
  assert.equal(convert(100, "ml", "g"), null);
  assert.equal(sameFamily("g", "ml"), false);
});

test("개수 단위는 이름이 같을 때만 센다", () => {
  // "슬라이스 치즈 100장"과 "치즈 2개"는 같은 게 아니다
  assert.equal(convert(2, "개", "장"), null);
  assert.equal(convert(2, "개", "개"), 2);
  assert.equal(convert(3, "장", "장"), 3);
  assert.equal(convert(1, "스쿱", "g"), null);
});

test("모르는 단위는 자기 자신하고만 맞는다", () => {
  assert.equal(convert(5, "봉지", "봉지"), 5);
  assert.equal(convert(5, "봉지", "g"), null);
});

test("숫자가 아니면 null", () => {
  assert.equal(convert(NaN, "g", "kg"), null);
  assert.equal(convert(Infinity, "g", "kg"), null);
});

test("familyLabel: 오류 문구에 쓸 이름", () => {
  assert.equal(familyLabel("kg"), "무게");
  assert.equal(familyLabel("ml"), "부피");
  assert.equal(familyLabel("장"), "'장' 단위");
});
