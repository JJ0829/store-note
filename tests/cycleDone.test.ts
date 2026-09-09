/* ------------------------------------------------------------------ *
 * 주기 점검 — 마지막으로 한 날
 *
 * ★ 이 파일이 막는 사고: **주기 점검 화면이 아무 기능을 못 하는 것.**
 *
 *   체크가 `prep:cycle:{영업일}` 에 저장돼서 다음 날 지워졌다.
 *   `4개월마다` 라고 적혀 있는데 앱은 그 4개월을 세지 않았다 —
 *   마지막으로 언제 했는지를 아무데도 남기지 않았기 때문이다.
 *
 *   그래서 저장 위치가 다르다. `sop:cycleDone` 은 **절대 안 지운다.**
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

const {
  daysLeft,
  daysSince,
  leftLabel,
  loadCycleDone,
  saveCycleDone,
  shortDay,
  sortByUrgency,
  toggleDone,
} = await import("../src/lib/cycleDone.ts");
const { pruneDayKeys } = await import("../src/lib/businessDay.ts");

/* ---------- 저장 ---------- */

test("저장하고 다시 읽는다", () => {
  local.clear();
  assert.ok(saveCycleDone({ "c-1": "2026-05-11" }));
  assert.deepEqual(loadCycleDone(), { "c-1": "2026-05-11" });
});

test("기록이 없으면 빈 객체", () => {
  local.clear();
  assert.deepEqual(loadCycleDone(), {});
});

test("★ 날짜 꼴이 아닌 값은 버린다", () => {
  // 깨진 값이 들어오면 아래 계산이 전부 NaN 이 되고, 화면이 "NaN일 남음" 을 띄운다
  local.clear();
  local.setItem(
    "sop:cycleDone",
    JSON.stringify({
      "c-1": "2026-05-11",
      "c-2": "어제",
      "c-3": 20260511,
      "c-4": null,
      "c-5": "2026-5-11",
    }),
  );
  assert.deepEqual(loadCycleDone(), { "c-1": "2026-05-11" });
});

test("★★ 영업일이 바뀌어도 안 지워진다 — 이 파일의 존재 이유", () => {
  // 예전에는 `prep:cycle:{영업일}` 이라서 pruneDayKeys 가 지워갔다.
  // 접두사를 `sop:` 으로 두고 꼬리를 날짜로 안 쓰는 것이 방어책이다
  local.clear();
  saveCycleDone({ "c-1": "2026-05-11" });
  local.setItem("prep:cycle:2026-09-07", '["c-1"]');

  pruneDayKeys("prep:cycle:", "2026-09-08");
  pruneDayKeys("sop:", "2026-09-08");

  assert.deepEqual(loadCycleDone(), { "c-1": "2026-05-11" }, "주기 기록이 지워졌다");
  assert.equal(local.getItem("prep:cycle:2026-09-07"), null, "그날 체크는 지워져야 한다");
});

/* ---------- 켜고 끄기 ---------- */

test("오늘 했다고 기록한다", () => {
  assert.deepEqual(toggleDone({}, "c-1", "2026-09-08"), { "c-1": "2026-09-08" });
});

test("★ 오늘 것을 다시 누르면 취소된다 (잘못 누른 것을 되돌린다)", () => {
  const cur = { "c-1": "2026-09-08" };
  assert.deepEqual(toggleDone(cur, "c-1", "2026-09-08"), {});
});

test("★ 지난 기록을 누르면 오늘로 갱신된다 — 취소가 아니다", () => {
  // 5/11 에 한 것을 오늘 다시 했으면 오늘 날짜가 돼야 한다.
  // 여기서 지워버리면 "기록 없음" 으로 되돌아가 더 나빠진다
  const cur = { "c-1": "2026-05-11" };
  assert.deepEqual(toggleDone(cur, "c-1", "2026-09-08"), { "c-1": "2026-09-08" });
});

test("원본을 건드리지 않는다", () => {
  const cur = { "c-1": "2026-05-11" };
  toggleDone(cur, "c-1", "2026-09-08");
  assert.deepEqual(cur, { "c-1": "2026-05-11" });
});

/* ---------- 며칠 지났나 / 남았나 ---------- */

test("daysSince: 지난 날수", () => {
  const d = { "c-1": "2026-09-01" };
  assert.equal(daysSince(d, "c-1", "2026-09-08"), 7);
  assert.equal(daysSince(d, "c-1", "2026-09-01"), 0);
});

test("★ 기록이 없으면 null — 0 으로 채우지 않는다", () => {
  // 0 으로 채우면 "오늘 해야 함" 으로 보이고, 큰 수로 채우면 "여유 있음" 으로
  // 보인다. 둘 다 거짓이다. 모른다는 것을 화면이 그대로 말해야 한다
  assert.equal(daysSince({}, "c-1", "2026-09-08"), null);
  assert.equal(daysLeft({}, "c-1", 120, "2026-09-08"), null);
});

test("daysLeft: 주기에서 지난 날수를 뺀다", () => {
  const d = { "c-1": "2026-05-11" }; // 2026-09-08 까지 120일
  assert.equal(daysSince(d, "c-1", "2026-09-08"), 120);
  assert.equal(daysLeft(d, "c-1", 120, "2026-09-08"), 0);
  assert.equal(daysLeft(d, "c-1", 90, "2026-09-08"), -30);
  assert.equal(daysLeft(d, "c-1", 365, "2026-09-08"), 245);
});

test("월말·연말·윤년을 거슬러 세도 맞는다", () => {
  assert.equal(daysSince({ x: "2026-08-31" }, "x", "2026-09-01"), 1);
  assert.equal(daysSince({ x: "2026-12-31" }, "x", "2027-01-01"), 1);
  assert.equal(daysSince({ x: "2028-02-28" }, "x", "2028-03-01"), 2); // 윤년
  assert.equal(daysSince({ x: "2026-02-28" }, "x", "2026-03-01"), 1); // 평년
});

test("1년 주기를 정확히 센다 (365일)", () => {
  assert.equal(daysSince({ x: "2025-09-08" }, "x", "2026-09-08"), 365);
  assert.equal(daysLeft({ x: "2025-09-08" }, "x", 365, "2026-09-08"), 0);
});

/* ---------- 화면 문구 ---------- */

test("★ 문구 — 기록 없음 / 지났음 / 오늘까지 / 남음", () => {
  assert.equal(leftLabel(null), "기록 없음 — 언제 했는지 모릅니다");
  assert.equal(leftLabel(-13), "13일 지났습니다");
  assert.equal(leftLabel(0), "오늘까지입니다");
  assert.equal(leftLabel(27), "27일 남음");
});

test("shortDay: 화면에는 5/11 로", () => {
  assert.equal(shortDay("2026-05-11"), "5/11");
  assert.equal(shortDay("2026-12-01"), "12/1");
  assert.equal(shortDay("깨짐"), "깨짐");
});

/* ---------- 정렬 ---------- */

const ITEMS = [
  { id: "filter", everyDays: 120 },
  { id: "scale", everyDays: 7 },
  { id: "fire", everyDays: 365 },
];

test("★★ 기록 없는 것이 맨 앞이다 — 모르는 것이 가장 위험하다", () => {
  // 소화기를 3년 전에 했는지 어제 했는지 모르는 상태가 제일 나쁘다.
  // 뒤로 밀면 사장님이 영영 안 채운다
  const done = { filter: "2026-09-07", scale: "2026-09-07" };
  const order = sortByUrgency(ITEMS, done, "2026-09-08").map((x) => x.id);
  assert.equal(order[0], "fire", "기록 없는 것이 맨 앞이 아니다");
});

test("★ 기록이 다 있으면 급한 것부터 (남은 날 오름차순)", () => {
  const done = {
    filter: "2026-09-07", // 120 - 1 = 119 남음
    scale: "2026-09-01", // 7 - 7 = 0 남음
    fire: "2026-09-07", // 364 남음
  };
  assert.deepEqual(
    sortByUrgency(ITEMS, done, "2026-09-08").map((x) => x.id),
    ["scale", "filter", "fire"],
  );
});

test("★ 지난 것이 아직 안 지난 것보다 앞이다", () => {
  const done = {
    filter: "2026-01-01", // 120 - 250 = 크게 음수
    scale: "2026-09-08", // 7 남음
    fire: "2026-09-08", // 365 남음
  };
  assert.deepEqual(
    sortByUrgency(ITEMS, done, "2026-09-08").map((x) => x.id),
    ["filter", "scale", "fire"],
  );
});

test("기록이 하나도 없으면 주기가 짧은 것부터", () => {
  assert.deepEqual(
    sortByUrgency(ITEMS, {}, "2026-09-08").map((x) => x.id),
    ["scale", "filter", "fire"],
  );
});

test("원본 배열을 건드리지 않는다", () => {
  const before = ITEMS.map((x) => x.id);
  sortByUrgency(ITEMS, {}, "2026-09-08");
  assert.deepEqual(
    ITEMS.map((x) => x.id),
    before,
  );
});

/* ---------- 저장소가 막혀 있을 때 ---------- */

test("저장소가 막혀 있어도 화면이 죽지 않는다", () => {
  const orig = Object.getOwnPropertyDescriptor(MemStorage.prototype, "getItem");
  Object.defineProperty(local, "getItem", {
    value() {
      throw new Error("SecurityError");
    },
    configurable: true,
  });
  assert.doesNotThrow(() => loadCycleDone());
  assert.deepEqual(loadCycleDone(), {});
  delete (local as unknown as Record<string, unknown>).getItem;
  if (orig) Object.defineProperty(MemStorage.prototype, "getItem", orig);
});
