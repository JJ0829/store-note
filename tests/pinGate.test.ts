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

/* ------------------------------------------------------------------ *
 * 번호를 잊었을 때 (2026-09-10)
 *
 * ★ 이 절이 막는 사고: **번호를 잊어서 3년 보존 대상 데이터가 갇히는 것.**
 *   `/backup` 이 사장님 잠금 뒤에 있고, 거기에 출퇴근·근로계약이 있다.
 *   근로기준법 제42조가 3년 보존을 요구하는 기록인데 꺼낼 방법이 없어진다.
 *   → 01_MVP기획서 §10.3 (다) #17
 *
 * ★★ 재설정이 **예전 번호를 안 묻는다.** 이 잠금은 가림막이라
 *   (검사가 브라우저 안에서 돌고 데이터는 저장소에 그대로 있다)
 *   물어봐야 막지도 못하면서 잊은 사람만 가둔다.
 *   화면이 그 사실을 그대로 말하는 것이 이 설계의 조건이다.
 * ------------------------------------------------------------------ */

test("★ 번호를 잊어도 새로 정할 수 있다 — 예전 번호를 안 묻는다", () => {
  local.clear();
  owner.setPin("1234");
  assert.equal(owner.checkPin("1234"), true);

  assert.equal(owner.resetPin("9876"), true);
  assert.equal(owner.checkPin("9876"), true);
  assert.equal(owner.checkPin("1234"), false, "예전 번호가 아직 통한다");
});

test("★ 재설정해도 데이터는 안 지운다 — 그게 이 기능의 목적이다", () => {
  // 번호를 잊었다고 3년 보존 대상 기록을 같이 지우면 본말이 뒤집힌다
  local.clear();
  owner.setPin("1234");
  local.setItem("sop:punch", '{"st1":{"2026-09-01":{}}}');
  local.setItem("sop:contracts", "[{}]");

  owner.resetPin("5555");

  assert.ok(local.getItem("sop:punch"), "출퇴근이 지워졌다");
  assert.ok(local.getItem("sop:contracts"), "근로계약이 지워졌다");
});

test("재설정도 4자리 미만은 거절한다", () => {
  local.clear();
  owner.setPin("1234");
  assert.equal(owner.resetPin("12"), false);
  assert.equal(owner.checkPin("1234"), true, "거절했는데 예전 번호가 깨졌다");
});

test("★ 매장 번호도 같은 방식으로 재설정된다", () => {
  local.clear();
  store.setPin("1111");
  assert.equal(store.resetPin("2222"), true);
  assert.equal(store.checkPin("2222"), true);
  assert.equal(store.checkPin("1111"), false);
});

test("★ 재설정한 뒤에는 잠금이 열려 있다 — 다시 안 묻는다", () => {
  // 새 번호를 방금 정한 사람에게 그 번호를 또 넣으라고 하면 화면이 멍청해 보인다
  local.clear();
  owner.setPin("1234");
  owner.lock();
  assert.equal(owner.isUnlocked(), false);

  owner.resetPin("9999");
  assert.equal(owner.isUnlocked(), true, "재설정 후에도 잠겨 있다");
});

test("★ 두 잠금의 재설정이 서로를 안 건드린다", () => {
  local.clear();
  owner.setPin("1234");
  store.setPin("5678");

  store.resetPin("0000");

  assert.equal(owner.checkPin("1234"), true, "매장 번호를 바꿨는데 사장님 번호가 바뀌었다");
  assert.equal(store.checkPin("0000"), true);
});
