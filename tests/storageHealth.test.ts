/* ------------------------------------------------------------------ *
 * 저장소 진단.
 *
 * ★ 왜 이게 따로 필요한가 — **개별 저장 실패 알림으로는 안 잡히는 구멍이 있다.**
 *
 *   `21_화면명세` §7-① 은 "체크리스트·프렙은 저장 실패를 조용히 넘긴다" 로
 *   정해뒀고 그건 맞다 (체크를 잃어도 그날 일은 계속해야 한다). 그런데
 *   **저장소가 통째로 죽어 있으면** 아침 내내 조용한 쪽만 쓰다가
 *   마감에 매출을 넣을 때 처음 알게 된다. 그때는 하루치가 이미 없다.
 *
 *   그래서 환경을 한 번 진단해서 첫 화면에서 말한다. 여기서 못 박는 것은
 *   **"막힘" 과 "공간 없음" 을 안 헷갈리는 것**이다 — 둘은 사장님이 할 일이
 *   완전히 다르다. 막힘은 브라우저 설정이고, 공간 없음은 백업을 받는 것이다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";

/** 상황을 만들어 끼우는 가짜 저장소 */
class FakeStorage {
  private m = new Map<string, string>();
  /** 쓰기가 던지게 한다 (용량 초과·시크릿 모드) */
  writeThrows = false;
  /** 읽기까지 던지게 한다 (사이트 데이터 차단) */
  readThrows = false;
  /** 한 번에 받아줄 수 있는 최대 글자 수. null 이면 무제한 */
  maxWrite: number | null = null;

  get length(): number {
    if (this.readThrows) throw new Error("SecurityError");
    return this.m.size;
  }
  key(i: number): string | null {
    if (this.readThrows) throw new Error("SecurityError");
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    if (this.readThrows) throw new Error("SecurityError");
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (this.writeThrows || this.readThrows) {
      throw new Error("QuotaExceededError");
    }
    if (this.maxWrite !== null && v.length > this.maxWrite) {
      // 작은 쓰기는 되고 큰 쓰기는 안 되는 상태 — 실제 브라우저가 이렇다
      throw new Error("QuotaExceededError");
    }
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    if (this.readThrows) throw new Error("SecurityError");
    this.m.delete(k);
  }
  seed(k: string, v: string): void {
    this.m.set(k, v);
  }
}

const fake = new FakeStorage();
(globalThis as Record<string, unknown>).localStorage = fake;

const { bytesLabel, healthMessage, probeStorage, storageUsage } = await import(
  "../src/lib/storageHealth.ts"
);

function reset() {
  (fake as unknown as { m: Map<string, string> }).m = new Map();
  fake.writeThrows = false;
  fake.readThrows = false;
  fake.maxWrite = null;
}

/* ---------- 진단 ---------- */

test("쓸 수 있으면 ok", () => {
  reset();
  assert.deepEqual(probeStorage(), { state: "ok" });
});

test("★ 진단이 찌꺼기를 남기지 않는다", () => {
  // 진단용 키가 남으면 백업 목록 검사(`sop:` 접두사)에도 안 걸리고,
  // 사용량 표시에도 안 잡히지만, 그래도 남기지 않는 게 맞다
  reset();
  probeStorage();
  assert.equal(fake.length, 0, "진단 키가 남았다");
});

test("★ 읽기까지 막히면 blocked — 시크릿 모드·사이트 데이터 차단", () => {
  reset();
  fake.readThrows = true;
  assert.deepEqual(probeStorage(), { state: "blocked" });
});

test("★ 쓰기만 막히고 기록이 있으면 full — 지금까지 넣은 것은 무사하다", () => {
  reset();
  fake.seed("sop:punch", "{}");
  fake.writeThrows = true;
  assert.deepEqual(probeStorage(), { state: "full" });
});

test("★ 쓰기가 막혔는데 기록이 하나도 없으면 blocked (공간 문제가 아니다)", () => {
  // 빈 기기에서 쓰기가 실패하는 것은 "찼다" 가 아니라 "애초에 못 쓴다" 다.
  // 여기서 full 이라고 하면 사장님에게 **백업을 받으라고** 말하게 되는데,
  // 받을 것도 없고 백업 자체도 저장이 안 된다 — 헛수고를 시키는 셈이다
  reset();
  fake.writeThrows = true;
  assert.deepEqual(probeStorage(), { state: "blocked" });
});

test("ok 일 때는 할 말이 없다", () => {
  assert.equal(healthMessage({ state: "ok" }), null);
});

test("★ 막힘과 공간 없음은 다른 것을 시킨다", () => {
  const blocked = healthMessage({ state: "blocked" }) ?? "";
  const full = healthMessage({ state: "full" }) ?? "";

  // 막힘 → 브라우저 설정을 고치라고 한다. 백업을 받으라고 하면 안 된다(저장이 안 된다)
  assert.match(blocked, /시크릿|설정/);
  assert.doesNotMatch(blocked, /백업을 받/);

  // 공간 없음 → 지금까지 것은 무사하다고 말하고, 백업을 받게 한다
  assert.match(full, /무사/);
  assert.match(full, /백업/);
});

/* ---------- 사용량 ---------- */

test("sop: 키만 센다 (다른 앱·진단 키는 안 센다)", () => {
  reset();
  fake.seed("sop:punch", "12345");
  fake.seed("other-app", "xxxxxxxxxxxxxxxxxxxx");
  const u = storageUsage();
  assert.equal(u.rows.length, 1);
  assert.equal(u.rows[0].key, "sop:punch");
  // (키 9자 + 값 5자) × 2바이트
  assert.equal(u.total, (9 + 5) * 2);
});

test("★ 큰 것부터 보여준다 — 무엇이 자라고 있는지가 알고 싶은 것이다", () => {
  reset();
  fake.seed("sop:settings", "x".repeat(10));
  fake.seed("sop:punch", "x".repeat(500));
  fake.seed("sop:sales", "x".repeat(100));
  assert.deepEqual(
    storageUsage().rows.map((r) => r.key),
    ["sop:punch", "sop:sales", "sop:settings"],
  );
});

test("읽기가 막혀도 사용량 계산이 안 죽는다", () => {
  reset();
  fake.readThrows = true;
  assert.deepEqual(storageUsage(), { total: 0, rows: [] });
});

test("크기 표기", () => {
  assert.equal(bytesLabel(500), "500B");
  assert.equal(bytesLabel(2048), "2KB");
  assert.equal(bytesLabel(3 * 1024 * 1024), "3.0MB");
});

/* ------------------------------------------------------------------ *
 * ★ 거짓 안심 — 2026-09-10 브라우저 실측에서 드러난 것.
 *
 * 처음에는 canary 를 1바이트로 썼다. 그런데 실제 브라우저는 저장소가
 * 거의 찼을 때 **작은 쓰기는 받아주고 큰 쓰기만 거절한다.**
 * 이 앱은 덩이를 통째로 쓴다 — `sop:punch` 하나가 수백 KB 다.
 *
 * 그래서 1바이트 canary 는 "ok" 라고 답하고, 그 직후 출퇴근 저장은 실패한다.
 * **없는 것보다 나쁘다.** 진단이 괜찮다고 말했으니까.
 * ------------------------------------------------------------------ */

test("★ 1바이트는 되는데 출퇴근 전체가 안 들어가면 full 이라고 말한다", () => {
  reset();
  // 출퇴근이 200KB 쌓여 있고, 브라우저는 이제 1KB까지만 받아준다
  fake.seed("sop:punch", "x".repeat(200 * 1024));
  fake.maxWrite = 1024;

  assert.deepEqual(
    probeStorage(),
    { state: "full" },
    "작은 쓰기만 보고 ok 라고 하면, 다음 출퇴근 저장이 실패하는 걸 못 잡는다",
  );
});

test("★ 다음 저장이 들어갈 자리가 있으면 ok", () => {
  reset();
  fake.seed("sop:punch", "x".repeat(200 * 1024));
  fake.maxWrite = 400 * 1024; // 한 번 더 쓸 자리가 있다
  assert.deepEqual(probeStorage(), { state: "ok" });
});

test("★ 빈 기기에서도 1바이트로 재지 않는다 (최소 16KB)", () => {
  // 아무것도 없는 기기에서 canary 를 1바이트로 잡으면, 첫 저장이 실패할
  // 기기를 ok 로 통과시킨다
  reset();
  fake.maxWrite = 1024;
  assert.deepEqual(
    probeStorage(),
    { state: "blocked" }, // sop: 기록이 없으므로 "못 쓰는 기기"
    "빈 기기에서 작은 쓰기만 보고 통과시켰다",
  );
});

test("★ 진단에 실패해도 canary 를 남기지 않는다", () => {
  // 남으면 그 자체가 공간을 먹는다. 가뜩이나 찬 상태에서
  reset();
  fake.seed("sop:punch", "x".repeat(200 * 1024));
  fake.maxWrite = 1024;
  probeStorage();

  const left: string[] = [];
  for (let i = 0; i < fake.length; i++) {
    const k = fake.key(i);
    if (k && !k.startsWith("sop:")) left.push(k);
  }
  assert.deepEqual(left, [], "진단 키가 남았다");
});

test("★ 성공했을 때도 canary 를 남기지 않는다", () => {
  reset();
  fake.seed("sop:punch", "{}");
  probeStorage();
  assert.equal(fake.length, 1, "sop:punch 하나만 남아 있어야 한다");
});
