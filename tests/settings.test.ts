/* ------------------------------------------------------------------ *
 * 매장 설정.
 *
 * ★ 이 파일에서 가장 중요한 것은 `fiveOrMore` 한 칸이다.
 *   상시 근로자 5인 이상인지가 **연장 가산수당 적용 여부를 가르고**
 *   (근로기준법 제56조), 그게 인건비 금액으로 바로 이어진다.
 *   `loadSettings()` 가 `=== true` 로만 받는 이유가 이것이다 —
 *   `"true"` 문자열이나 `1` 을 참으로 받아버리면 5인 미만 매장에
 *   가산수당이 붙고, 사장님은 원인을 못 찾는다.
 *
 * 저장소는 node 에 없으므로 가짜로 심는다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

const local = new MemStorage();
(globalThis as Record<string, unknown>).localStorage = local;

const { DEFAULTS, loadSettings, saveSettings } = await import("../src/lib/settings.ts");

const KEY = "sop:settings";
function put(raw: string) {
  local.clear();
  local.setItem(KEY, raw);
}

/* ---------- 기본값 자체 ---------- */

test("2026년 최저임금 기본값은 10,320원", () => {
  // 해마다 바뀐다. 코드에 박지 않고 기본값으로만 두는 것이 의도다
  assert.equal(DEFAULTS.minWage, 10_320);
});

test("★ 5인 이상 여부의 기본값은 false — 개인 카페가 타겟이다", () => {
  assert.equal(DEFAULTS.fiveOrMore, false);
});

test("목표 원가율 기본값은 30%", () => {
  assert.equal(DEFAULTS.targetCostRate, 30);
});

test("저장된 게 없으면 기본값을 그대로 준다", () => {
  local.clear();
  assert.deepEqual(loadSettings(), DEFAULTS);
});

/* ---------- ★ fiveOrMore — 인건비를 바꾸는 칸 ---------- */

test("★ 문자열 'true' 를 참으로 받지 않는다", () => {
  put(JSON.stringify({ fiveOrMore: "true" }));
  assert.equal(loadSettings().fiveOrMore, false);
});

test("★ 숫자 1 을 참으로 받지 않는다", () => {
  put(JSON.stringify({ fiveOrMore: 1 }));
  assert.equal(loadSettings().fiveOrMore, false);
});

test("진짜 true 만 참이다", () => {
  put(JSON.stringify({ fiveOrMore: true }));
  assert.equal(loadSettings().fiveOrMore, true);
});

/* ---------- 숫자 칸 방어 ---------- */

test("최저임금이 문자열로 저장돼 있으면 기본값으로 돌린다", () => {
  put(JSON.stringify({ minWage: "10320" }));
  assert.equal(loadSettings().minWage, DEFAULTS.minWage);
});

test("최저임금 0 은 그대로 받는다 — 사장님이 경고를 끄려는 선택일 수 있다", () => {
  put(JSON.stringify({ minWage: 0 }));
  assert.equal(loadSettings().minWage, 0);
});

test("★ 목표 원가율 0 은 거부한다 (역산에서 0 으로 나눈다)", () => {
  put(JSON.stringify({ targetCostRate: 0 }));
  assert.equal(loadSettings().targetCostRate, DEFAULTS.targetCostRate);
});

test("목표 원가율 음수도 거부한다", () => {
  put(JSON.stringify({ targetCostRate: -5 }));
  assert.equal(loadSettings().targetCostRate, DEFAULTS.targetCostRate);
});

test("목표 원가율이 100 을 넘어도 막지 않는다 (알려진 한계)", () => {
  // 원가율 120% 는 적자 메뉴다. 있을 수 있는 값이라 거부하지 않는다
  put(JSON.stringify({ targetCostRate: 120 }));
  assert.equal(loadSettings().targetCostRate, 120);
});

/* ---------- 구조 칸 방어 ---------- */

test("판매가가 객체가 아니면 빈 객체로 돌린다", () => {
  for (const bad of ["[]자리", 5, "문자열"]) {
    put(JSON.stringify({ prices: bad }));
    assert.deepEqual(loadSettings().prices, {});
  }
});

test("알려진 구멍: 판매가에 배열이 들어오면 걸러지지 않는다", () => {
  // `typeof [] === "object"` 라 현재 검사(`typeof s.prices === "object"`)를
  // 통과한다. 화면에서 배열을 넣는 경로는 없으므로 지금은 사고가 아니지만,
  // 백업 JSON 을 손으로 고쳐 넣으면 들어올 수 있다.
  // **막지 않는다는 사실 자체를 고정한다** — 나중에 막으면 이 테스트가 실패해서
  // "의도적으로 바꿨다"는 것이 드러난다.
  put(JSON.stringify({ prices: [1, 2] }));
  assert.ok(Array.isArray(loadSettings().prices), "지금은 배열이 그대로 통과한다");
});

test("원가 제외 목록이 배열이 아니면 빈 배열", () => {
  put(JSON.stringify({ excluded: "추출량" }));
  assert.deepEqual(loadSettings().excluded, []);
});

test("원가 제외 목록은 배열이면 그대로", () => {
  put(JSON.stringify({ excluded: ["추출량", "수돗물"] }));
  assert.deepEqual(loadSettings().excluded, ["추출량", "수돗물"]);
});

/* ---------- 깨진 저장소 ---------- */

test("깨진 JSON 이 들어 있어도 화면이 죽지 않는다", () => {
  put("{이건 JSON이 아니다");
  assert.deepEqual(loadSettings(), DEFAULTS);
});

test("null 이 저장돼 있어도 기본값", () => {
  put("null");
  assert.deepEqual(loadSettings(), DEFAULTS);
});

/* ---------- 왕복 ---------- */

test("saveSettings → loadSettings 왕복", () => {
  local.clear();
  const s = {
    minWage: 11_000,
    fiveOrMore: true,
    targetCostRate: 28,
    prices: { "r-1": 4500 },
    excluded: ["추출량"],
  };
  assert.equal(saveSettings(s), true);
  assert.deepEqual(loadSettings(), s);
});

test("저장에 실패하면 false 를 돌려준다 (예외를 던지지 않는다)", () => {
  const orig = local.setItem;
  local.setItem = () => {
    throw new Error("QuotaExceeded");
  };
  assert.equal(saveSettings(DEFAULTS), false);
  local.setItem = orig;
});
