/* ------------------------------------------------------------------ *
 * PIN 두 종류 — 사장님 잠금 / 매장 잠금.
 *
 * ★ 여기서 지키려는 것은 "안전"이 아니라 **둘이 안 섞이는 것**이다.
 *   섞이면 제품이 조용히 망가진다:
 *   - 레시피에 사장님 PIN이 걸리면 → 직원이 매일 여는 화면이 막힌다
 *   - 매장 PIN으로 매출이 열리면   → 직원 전부가 아는 번호로 매출이 열린다
 *
 * 저장소(localStorage/sessionStorage)는 node에 없으므로 가짜로 심는다.
 * 실제 화면 동작이 아니라 **계산과 규칙**을 고정하는 테스트다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import { digest } from "../src/lib/pinDigest.ts";

/* ---------- 가짜 저장소 (import 전에 심어야 한다) ---------- */

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
const session = new MemStorage();
(globalThis as Record<string, unknown>).localStorage = local;
(globalThis as Record<string, unknown>).sessionStorage = session;

const owner = await import("../src/lib/ownerGate.ts");
const store = await import("../src/lib/storeGate.ts");

function reset() {
  local.clear();
  session.clear();
}

/* ---------- 요약값 ---------- */

test("PIN을 그대로 저장하지 않는다", () => {
  reset();
  owner.setPin("1234");
  const saved = local.getItem("sop:ownerPin");
  assert.ok(saved);
  assert.notEqual(saved, "1234");
  assert.ok(!saved.includes("1234"));
});

test("★ 같은 번호라도 사장님 것과 매장 것의 저장값이 다르다", () => {
  // 소금이 같으면, 한쪽 저장소를 본 사람이 다른 쪽도 같은 번호인 걸 안다
  assert.notEqual(digest("sop-owner", "1234"), digest("sop-store", "1234"));
});

test("같은 소금·같은 번호는 항상 같은 값 (안 그러면 로그인이 안 된다)", () => {
  assert.equal(digest("sop-owner", "9137"), digest("sop-owner", "9137"));
});

test("사장님 소금은 sop-owner 그대로다 — 바꾸면 저장된 PIN이 깨진다", () => {
  reset();
  owner.setPin("4321");
  assert.equal(local.getItem("sop:ownerPin"), digest("sop-owner", "4321"));
});

/* ---------- 첫 사용자를 가두지 않는다 ---------- */

test("PIN을 안 만들었으면 잠그지 않는다", () => {
  reset();
  assert.equal(owner.needsPin(), false);
  assert.equal(store.needsPin(), false);
});

/* ---------- 자물쇠가 서로 안 섞인다 ---------- */

test("★ 매장 번호로는 사장님 화면이 열리지 않는다", () => {
  reset();
  owner.setPin("1111");
  store.setPin("2222");
  owner.lock();
  store.lock();

  // 직원이 아는 매장 번호를 넣어도
  assert.equal(store.checkPin("2222"), true);
  store.unlock();

  // 매출·시급은 여전히 잠겨 있어야 한다
  assert.equal(owner.isUnlocked(), false);
  assert.equal(owner.needsPin(), true);
});

test("★ 사장님 잠금이 풀려 있으면 레시피도 열린다 (번호 두 개 외우게 하지 않는다)", () => {
  reset();
  owner.setPin("1111");
  store.setPin("2222");
  owner.lock();
  store.lock();

  assert.equal(store.needsPin(), true);
  owner.unlock();
  assert.equal(store.isUnlocked(), true);
  assert.equal(store.needsPin(), false);
});

test("한쪽 번호를 다른 쪽에 넣으면 안 열린다", () => {
  reset();
  owner.setPin("1111");
  store.setPin("2222");
  assert.equal(owner.checkPin("2222"), false);
  assert.equal(store.checkPin("1111"), false);
});

/* ---------- 자잘하지만 실제로 겪는 것 ---------- */

test("4자리 미만은 만들지 않는다", () => {
  reset();
  assert.equal(owner.setPin("123"), false);
  assert.equal(store.setPin("99"), false);
  assert.equal(owner.hasPin(), false);
  assert.equal(store.hasPin(), false);
});

test("만들면 곧바로 열린 상태가 된다 — 만들자마자 잠기면 당황한다", () => {
  reset();
  store.setPin("2222");
  assert.equal(store.isUnlocked(), true);
});

test("PIN이 없으면 아무 번호도 통과시키지 않는다", () => {
  reset();
  assert.equal(owner.checkPin("1234"), false);
  assert.equal(store.checkPin("1234"), false);
});

test("잠금 해제는 sessionStorage에 둔다 — 브라우저를 닫으면 다시 잠긴다", () => {
  reset();
  store.setPin("2222");
  assert.equal(store.isUnlocked(), true);

  // 브라우저를 닫았다 = sessionStorage만 날아간다
  session.clear();
  assert.equal(store.hasPin(), true); // 번호는 남아 있고
  assert.equal(store.isUnlocked(), false); // 열린 상태는 사라진다
  assert.equal(store.needsPin(), true);
});
