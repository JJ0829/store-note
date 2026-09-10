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
  loadCycleEvery,
  saveCycleDone,
  saveCycleEvery,
  setDone,
  setEvery,
  shortDay,
  sortByUrgency,
  statusLine,
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
  { id: "filter", everyDays: 120 as number | null },
  { id: "scale", everyDays: 7 as number | null },
  { id: "fire", everyDays: 365 as number | null },
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

test("★ 주기를 안 정한 것은 맨 아래다 — 기한을 판단할 수 없다", () => {
  // 판단 못 하는 것을 위에 올리면 실제로 급한 것이 밀린다
  const items = [
    { id: "noEvery", everyDays: null },
    { id: "late", everyDays: 7 },
    { id: "none", everyDays: 30 },
  ];
  const done = { noEvery: "2020-01-01", late: "2026-08-01" };
  assert.deepEqual(
    sortByUrgency(items, done, "2026-09-08").map((x) => x.id),
    ["none", "late", "noEvery"],
  );
});

test("기록이 하나도 없으면 시드 순서를 지킨다", () => {
  // 주기가 매장 설정으로 빠졌으므로 "주기 짧은 것부터" 를 기본값으로
  // 쓸 수 없다. 사장님이 정렬해둔 시드 순서가 그대로 기준이 된다
  assert.deepEqual(
    sortByUrgency(ITEMS, {}, "2026-09-08").map((x) => x.id),
    ["filter", "scale", "fire"],
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

/* ---------- 매장이 정하는 주기 ---------- */

test("★★ 주기를 안 정하면 기한을 지어내지 않는다", () => {
  const done = { x: "2026-01-01" }; // 250일 전
  assert.equal(daysSince(done, "x", "2026-09-08"), 250);
  assert.equal(daysLeft(done, "x", null, "2026-09-08"), null, "없는 기한을 만들었다");
});

test("주기를 넣고 지운다", () => {
  assert.deepEqual(setEvery({}, "c-1", 120), { "c-1": 120 });
  assert.deepEqual(setEvery({ "c-1": 120 }, "c-1", null), {});
});

test("★ 0 이나 음수 주기는 안 정한 것으로 본다", () => {
  // 0 이면 늘 "오늘까지" 로 계산돼 매일 빨갛게 뜬다
  assert.deepEqual(setEvery({}, "c-1", 0), {});
  assert.deepEqual(setEvery({}, "c-1", -5), {});
  assert.deepEqual(setEvery({}, "c-1", Number.NaN), {});
});

test("소수는 반올림해서 넣는다", () => {
  assert.deepEqual(setEvery({}, "c-1", 29.6), { "c-1": 30 });
});

test("저장한 주기를 다시 읽는다. 깨진 값은 버린다", () => {
  local.clear();
  local.setItem(
    "sop:cycleEvery",
    JSON.stringify({ a: 30, b: "30", c: 0, d: -1, e: null, f: 7 }),
  );
  assert.deepEqual(loadCycleEvery(), { a: 30, f: 7 });
  assert.ok(saveCycleEvery({ a: 90 }));
  assert.deepEqual(loadCycleEvery(), { a: 90 });
});

/* ---------- 마지막 날짜 직접 입력 ---------- */

test("★ 지난 날짜를 직접 채울 수 있다 — 사장님이 한 번 채워야 하는 것", () => {
  assert.deepEqual(setDone({}, "c-1", "2026-05-11"), { "c-1": "2026-05-11" });
});

test("빈 값·깨진 값을 넣으면 기록을 지운다", () => {
  const cur = { "c-1": "2026-05-11" };
  assert.deepEqual(setDone(cur, "c-1", ""), {});
  assert.deepEqual(setDone(cur, "c-1", null), {});
  assert.deepEqual(setDone(cur, "c-1", "2026-5-11"), {});
});

/* ---------- 화면 한 줄 ---------- */

test("★★ 화면 한 줄 — 세 가지뿐이다", () => {
  const day = "2026-09-08";

  // ① 기록 없음 → 빨강
  assert.deepEqual(statusLine({}, "x", 30, day), {
    text: "기록 없음 — 언제 했는지 모릅니다",
    late: true,
  });
  // 주기까지 없어도 같은 말이다. 마지막 날이 없으면 주기는 뜻이 없다
  assert.deepEqual(statusLine({}, "x", null, day), {
    text: "기록 없음 — 언제 했는지 모릅니다",
    late: true,
  });

  // ② 기록 있고 주기 없음 → 며칠 전만. **기한을 판단하지 않는다**
  assert.deepEqual(statusLine({ x: "2026-05-11" }, "x", null, day), {
    text: "마지막 5/11 · 120일 전",
    late: false,
  });

  // ③ 기록 있고 주기 있음 → 남았거나 지났다
  assert.deepEqual(statusLine({ x: "2026-05-11" }, "x", 150, day), {
    text: "마지막 5/11 · 30일 남음",
    late: false,
  });
  assert.deepEqual(statusLine({ x: "2026-05-11" }, "x", 90, day), {
    text: "마지막 5/11 · 30일 지났습니다",
    late: true,
  });
  assert.deepEqual(statusLine({ x: "2026-05-11" }, "x", 120, day), {
    text: "마지막 5/11 · 오늘까지입니다",
    late: false,
  });
});

test("★ 주기를 안 정한 항목은 아무리 오래돼도 빨갛지 않다", () => {
  // 앱이 모르는 기한으로 사장님을 재촉하지 않는다.
  // 그래도 "3000일 전" 이라는 사실은 그대로 보여준다
  const r = statusLine({ x: "2018-01-01" }, "x", null, "2026-09-08");
  assert.equal(r.late, false);
  assert.match(r.text, /마지막 1\/1 · \d+일 전/);
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

/* ------------------------------------------------------------------ *
 * 미래 날짜 (2026-09-10 전체 점검에서 발견)
 *
 * ★ 이 절이 막는 사고: **"안 한 것"이 "여유 있음"으로 보이는 것.**
 *   날짜 칸에 실수로 다음 달을 넣으면 `daysSince` 가 음수가 되고
 *   `everyDays - (음수)` 는 큰 양수라 **빨간 표시가 오히려 풀린다.**
 *   이 화면에서 제일 나쁜 거짓말이다 — 해야 할 것을 안 해도 된다고 말한다.
 * ------------------------------------------------------------------ */

test("★★ 미래 날짜는 기록으로 안 받는다", () => {
  assert.deepEqual(setDone({}, "c-1", "2026-12-25", "2026-09-10"), {});
  // 오늘은 받는다
  assert.deepEqual(setDone({}, "c-1", "2026-09-10", "2026-09-10"), {
    "c-1": "2026-09-10",
  });
  // 어제도 받는다
  assert.deepEqual(setDone({}, "c-1", "2026-09-09", "2026-09-10"), {
    "c-1": "2026-09-09",
  });
});

test("★ 미래 날짜를 넣으면 있던 기록이 지워진다 — 거짓 기록을 남기느니 없는 게 낫다", () => {
  const cur = { "c-1": "2026-05-11" };
  assert.deepEqual(setDone(cur, "c-1", "2027-01-01", "2026-09-10"), {});
});

test("★ 미래 날짜가 들어갔다면 어떤 꼴이 됐을지 — 이래서 막는다", () => {
  // 30일 주기인데 마지막을 두 달 뒤로 적으면 "83일 남음" 이 된다
  const bad = { "c-1": "2026-12-02" };
  const left = daysLeft(bad, "c-1", 30, "2026-09-10");
  assert.ok(left !== null && left > 0, "미래 날짜가 '남음' 으로 계산된다");
  assert.equal(statusLine(bad, "c-1", 30, "2026-09-10").late, false);
});
