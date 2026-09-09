/* ------------------------------------------------------------------ *
 * 매장의 하루 — 경계는 자정이 아니라 새벽 4시다.
 *
 * ★ 이 파일이 막는 사고: 마감조가 근무 중에 체크를 잃는 것.
 *   23:50 에 6개 체크 → 00:10 에 화면을 다시 열면 전부 사라져 보였다.
 *   달력 날짜로 키를 만들었기 때문이다.
 *
 *   출퇴근은 같은 문제를 이미 처리하고 있었다(`workedMinutes`).
 *   체크리스트·프렙만 자정을 그대로 맞고 있었고, 그게 일관성 결함이었다.
 *
 * → docs/deliverables/19_정책정의서.md §3.2
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";

class MemStorage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
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

const { DAY_START_HOUR, businessDay, dayKey, pruneDayKeys, recentDays } = await import(
  "../src/lib/businessDay.ts"
);

/** 로컬 시각으로 Date 를 만든다 (월은 0-based) */
const at = (y: number, m: number, d: number, hh: number, mm = 0) =>
  new Date(y, m - 1, d, hh, mm);

/* ---------- 경계 ---------- */

test("경계는 새벽 4시다", () => {
  assert.equal(DAY_START_HOUR, 4);
});

test("★ 03:59 는 아직 어제다", () => {
  assert.equal(businessDay(at(2026, 9, 10, 3, 59)), "2026-09-09");
});

test("★ 04:00 부터 오늘이다", () => {
  assert.equal(businessDay(at(2026, 9, 10, 4, 0)), "2026-09-10");
});

test("낮 시간은 달력 날짜와 같다", () => {
  assert.equal(businessDay(at(2026, 9, 10, 14, 30)), "2026-09-10");
});

test("23:59 도 그날이다", () => {
  assert.equal(businessDay(at(2026, 9, 10, 23, 59)), "2026-09-10");
});

/* ---------- ★ 마감조 시나리오 — 이 파일의 존재 이유 ---------- */

test("★★ 마감조가 자정을 넘겨도 같은 영업일이다 (23:50 → 00:10)", () => {
  const before = businessDay(at(2026, 9, 9, 23, 50));
  const after = businessDay(at(2026, 9, 10, 0, 10));
  assert.equal(before, after, "자정에 영업일이 바뀌었다 — 체크가 사라진다");
  assert.equal(before, "2026-09-09");
});

test("★ 저장 키가 자정 전후로 같다", () => {
  const k1 = dayKey("sop:cafe-close:", businessDay(at(2026, 9, 9, 23, 50)));
  const k2 = dayKey("sop:cafe-close:", businessDay(at(2026, 9, 10, 0, 10)));
  assert.equal(k1, k2);
  assert.equal(k1, "sop:cafe-close:2026-09-09");
});

test("마감조가 01:00 에 퇴근해도 어제 키다", () => {
  assert.equal(businessDay(at(2026, 9, 10, 1, 0)), "2026-09-09");
});

test("★★ 제빵조가 일찍 와도 경계에 안 걸린다 (04:50 도착 → 05:00 출근)", () => {
  // 경계를 05:00 으로 뒀을 때의 사고: 04:50 에 열면 어제 키, 05:00 넘겨
  // 새로고침하면 오늘 키로 바뀌어 그 사이 체크가 사라져 보였다.
  // 04:00 경계에서는 둘 다 같은 영업일이어야 한다
  const early = businessDay(at(2026, 9, 10, 4, 50)); // 미리 도착
  const onTime = businessDay(at(2026, 9, 10, 5, 0)); // 정시 출근
  assert.equal(early, onTime, "제빵조가 경계에 걸린다");
  assert.equal(early, "2026-09-10");
});

test("제빵조(05:00)와 마감조(01:00)는 서로 다른 영업일이다", () => {
  assert.notEqual(
    businessDay(at(2026, 9, 10, 5, 0)),
    businessDay(at(2026, 9, 10, 1, 0)),
  );
});

/* ---------- 월말 · 연말 · 윤년 ---------- */

test("월초 새벽은 전달 마지막 날로 간다", () => {
  assert.equal(businessDay(at(2026, 9, 1, 2, 0)), "2026-08-31");
});

test("연초 새벽은 작년 마지막 날로 간다", () => {
  assert.equal(businessDay(at(2027, 1, 1, 3, 0)), "2026-12-31");
});

test("윤년 3월 1일 새벽은 2월 29일이다 (2028년)", () => {
  // 03:00 은 경계(04:00) 아래라 아직 전날이다
  assert.equal(businessDay(at(2028, 3, 1, 3, 0)), "2028-02-29");
  // 04:00 부터는 3월 1일
  assert.equal(businessDay(at(2028, 3, 1, 4, 0)), "2028-03-01");
});

test("평년 3월 1일 새벽은 2월 28일이다", () => {
  assert.equal(businessDay(at(2026, 3, 1, 3, 0)), "2026-02-28");
});

test("넘긴 Date 를 건드리지 않는다", () => {
  const d = at(2026, 9, 10, 2, 0);
  const copy = d.getTime();
  businessDay(d);
  assert.equal(d.getTime(), copy, "원본 Date 가 바뀌었다");
});

/* ---------- 키 만들기 ---------- */

test("dayKey 는 접두사에 영업일을 붙인다", () => {
  assert.equal(dayKey("prep:afternoon:", "2026-09-09"), "prep:afternoon:2026-09-09");
});

/* ---------- 지난 키 지우기 ---------- */

test("★ 지난 영업일 키를 지운다 — 화면이 약속한 '초기화'", () => {
  local.clear();
  local.setItem("prep:afternoon:2026-09-07", "[]");
  local.setItem("prep:afternoon:2026-09-08", "[]");
  local.setItem("prep:afternoon:2026-09-09", '["p-1"]');

  const removed = pruneDayKeys("prep:afternoon:", "2026-09-09");

  assert.equal(removed.length, 2);
  assert.equal(local.getItem("prep:afternoon:2026-09-09"), '["p-1"]', "오늘 것이 지워졌다");
  assert.equal(local.getItem("prep:afternoon:2026-09-08"), null);
  assert.equal(local.getItem("prep:afternoon:2026-09-07"), null);
});

test("★ 다른 목록의 키는 건드리지 않는다", () => {
  local.clear();
  local.setItem("prep:afternoon:2026-09-08", "[]");
  local.setItem("prep:cycle:2026-09-08", "[]");

  pruneDayKeys("prep:afternoon:", "2026-09-09");

  assert.equal(local.getItem("prep:cycle:2026-09-08"), "[]", "다른 목록이 지워졌다");
});

test("★★ 법정 보존 대상을 건드리지 않는다", () => {
  local.clear();
  // 접두사가 `sop:` 로 겹치지만 날짜 키가 아니다
  local.setItem("sop:punch", '{"st1":{}}');
  local.setItem("sop:contracts", "[]");
  local.setItem("sop:roster", '{"staff":[]}');
  local.setItem("sop:settings", "{}");
  local.setItem("sop:ownerPin", "abc");
  local.setItem("sop:cafe-open:2026-09-08", "[]");

  pruneDayKeys("sop:cafe-open:", "2026-09-09");

  for (const k of ["sop:punch", "sop:contracts", "sop:roster", "sop:settings", "sop:ownerPin"]) {
    assert.ok(local.getItem(k) !== null, `${k} 가 지워졌다`);
  }
  assert.equal(local.getItem("sop:cafe-open:2026-09-08"), null);
});

test("날짜 꼴이 아닌 꼬리는 건드리지 않는다", () => {
  local.clear();
  local.setItem("prep:afternoon:메모", "x");
  local.setItem("prep:afternoon:2026-9-8", "x"); // 자리수가 안 맞는다
  local.setItem("prep:afternoon:2026-09-08", "[]");

  pruneDayKeys("prep:afternoon:", "2026-09-09");

  assert.equal(local.getItem("prep:afternoon:메모"), "x");
  assert.equal(local.getItem("prep:afternoon:2026-9-8"), "x");
  assert.equal(local.getItem("prep:afternoon:2026-09-08"), null);
});

test("지울 게 없으면 빈 배열", () => {
  local.clear();
  local.setItem("prep:afternoon:2026-09-09", "[]");
  assert.deepEqual(pruneDayKeys("prep:afternoon:", "2026-09-09"), []);
});

test("저장소가 막혀 있어도 예외를 던지지 않는다", () => {
  const origLen = Object.getOwnPropertyDescriptor(MemStorage.prototype, "length");
  Object.defineProperty(local, "length", {
    get() {
      throw new Error("SecurityError");
    },
    configurable: true,
  });
  assert.doesNotThrow(() => pruneDayKeys("prep:afternoon:", "2026-09-09"));
  delete (local as unknown as Record<string, unknown>).length;
  if (origLen) Object.defineProperty(MemStorage.prototype, "length", origLen);
});

/* ---------- 지난 영업일 목록 (발주 화면이 쓴다) ---------- */

test("recentDays: 직전 7일을 최신순으로", () => {
  assert.deepEqual(recentDays("2026-09-09", 3), ["2026-09-08", "2026-09-07", "2026-09-06"]);
});

test("recentDays: 오늘은 안 들어간다", () => {
  assert.ok(!recentDays("2026-09-09", 7).includes("2026-09-09"));
});

test("recentDays: 월초를 거슬러 간다", () => {
  assert.deepEqual(recentDays("2026-09-02", 3), ["2026-09-01", "2026-08-31", "2026-08-30"]);
});

test("recentDays: 연초를 거슬러 간다", () => {
  assert.deepEqual(recentDays("2027-01-01", 2), ["2026-12-31", "2026-12-30"]);
});

test("recentDays: 윤년 3/1 은 2/29 로 (2028)", () => {
  assert.equal(recentDays("2028-03-01", 1)[0], "2028-02-29");
});

test("recentDays: n=0 이면 빈 배열", () => {
  assert.deepEqual(recentDays("2026-09-09", 0), []);
});

test("recentDays: 날짜가 깨져 있으면 빈 배열 (화면이 죽지 않는다)", () => {
  assert.deepEqual(recentDays("어제", 7), []);
});

test("★ 발주 창이 자정 직후에 하루 밀리지 않는다", () => {
  // 00:10 은 아직 어제(영업일)다. 그 기준으로 지난 7일을 세야 한다
  const day = businessDay(at(2026, 9, 10, 0, 10)); // 2026-09-09
  assert.equal(day, "2026-09-09");
  assert.equal(recentDays(day, 1)[0], "2026-09-08");
});
