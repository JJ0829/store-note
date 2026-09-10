/* ------------------------------------------------------------------ *
 * 되돌리기(복원)가 실제로 저장소에 무엇을 하는가.
 *
 * ★ `backup.test.ts` 는 **파일을 만들고 검사하는** 부분을 덮는다(19개).
 *   이 파일은 **저장소에 쓰는** 부분을 덮는다 — 저장소 스텁이 import 보다
 *   먼저 심어져야 해서 파일을 나눴다.
 *
 * 여기서 고정할 것은 하나다: **합치지 않고 덮어쓴다.**
 *   합치기를 만들지 않은 이유는 같은 직원·같은 날짜의 출퇴근이 양쪽에
 *   다르게 있으면 어느 쪽이 맞는지 앱이 알 수 없기 때문이다. 조용히
 *   한쪽을 고르면 근태가 틀리고 그건 급여로 이어진다.
 *   → docs/deliverables/15_인수기준.md AC-06 #9
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import type { Punch, PunchData } from "../src/lib/attendance.ts";
import type { Contract } from "../src/lib/contracts.ts";
import type { Staff } from "../src/lib/roster.ts";

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

const { applyRestore, backupCounts, buildBackup, BACKUP_VERSION } = await import(
  "../src/lib/backup.ts"
);

/* ---------- 도우미 ---------- */

function punch(staffId: string, date: string): Punch {
  return {
    id: "pu-" + staffId + date,
    staffId,
    date,
    inAt: "07:00",
    outAt: "15:00",
    breakMin: 30,
    note: "",
  };
}

function contract(staffId: string, wage: number): Contract {
  return {
    id: "ct-" + staffId,
    staffId,
    startDate: "2026-01-02",
    endDate: "",
    hourlyWage: wage,
    weeklyHours: 20,
    workDays: [1, 3, 5],
    startTime: "09:00",
    endTime: "14:00",
    handedOver: true,
    insured: true,
    note: "",
  };
}

function staff(id: string, name: string): Staff {
  return { id, section: "바", name, email: "", phone: "" };
}

function toData(list: Punch[]): PunchData {
  const out: PunchData = {};
  for (const p of list) out[p.staffId] = { ...(out[p.staffId] ?? {}), [p.date]: p };
  return out;
}

/** 저장소를 직접 채운다 (화면이 입력해둔 상태를 흉내낸다) */
function seedStore(opts: {
  staff: Staff[];
  punches: Punch[];
  contracts: Contract[];
}) {
  local.clear();
  local.setItem("sop:roster", JSON.stringify({ staff: opts.staff, assign: {} }));
  local.setItem("sop:punch", JSON.stringify(toData(opts.punches)));
  local.setItem("sop:contracts", JSON.stringify(opts.contracts));
}

function currentCounts() {
  return backupCounts(buildBackup("○○ 베이커리 카페"));
}

/* ---------- buildBackup ---------- */

test("buildBackup 은 지금 저장소를 그대로 담는다", () => {
  seedStore({
    staff: [staff("st1", "김제빵"), staff("st2", "이바리스타")],
    punches: [punch("st1", "2026-09-01"), punch("st2", "2026-09-01")],
    contracts: [contract("st1", 11_000)],
  });
  const b = buildBackup("○○ 베이커리 카페");
  assert.equal(b.kind, "store-note-backup");
  assert.equal(b.version, BACKUP_VERSION);
  assert.equal(b.storeName, "○○ 베이커리 카페");
  assert.deepEqual(backupCounts(b), {
    staff: 2,
    punches: 2,
    contracts: 1,
    cycle: 0,
    salesDays: 0,
    vendors: 0,
    recipes: 0,
    orderDays: 0,
  });
});

test("빈 저장소도 백업된다 (0건 매장)", () => {
  local.clear();
  assert.deepEqual(currentCounts(), {
    staff: 0,
    punches: 0,
    contracts: 0,
    cycle: 0,
    salesDays: 0,
    vendors: 0,
    recipes: 0,
    orderDays: 0,
  });
});

test("exportedAt 이 ISO 시각으로 들어간다 — 어느 것이 최신인지 사람이 본다", () => {
  local.clear();
  const b = buildBackup("○○");
  assert.match(b.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
});

/* ---------- ★ 덮어쓰기 ---------- */

test("★ 합치지 않고 덮어쓴다 — 출퇴근 5건이 3건으로 줄어든다", () => {
  // 지금 저장소: 5건
  seedStore({
    staff: [staff("st1", "김제빵")],
    punches: [
      punch("st1", "2026-09-01"),
      punch("st1", "2026-09-02"),
      punch("st1", "2026-09-03"),
      punch("st1", "2026-09-04"),
      punch("st1", "2026-09-05"),
    ],
    contracts: [contract("st1", 11_000)],
  });
  assert.equal(currentCounts().punches, 5);

  // 백업: 3건뿐인 예전 것
  const older = {
    kind: "store-note-backup" as const,
    version: BACKUP_VERSION,
    exportedAt: "2026-09-03T00:00:00.000Z",
    storeName: "○○",
    roster: { staff: [staff("st1", "김제빵")], assign: {} },
    punches: toData([
      punch("st1", "2026-09-01"),
      punch("st1", "2026-09-02"),
      punch("st1", "2026-09-03"),
    ]),
    contracts: [contract("st1", 11_000)],
  };

  const r = applyRestore(older);
  assert.equal(r.ok, true);
  // 합쳤으면 5건이 남아야 한다. 덮어썼으므로 3건이다
  assert.equal(currentCounts().punches, 3, "합쳐졌다 — 덮어쓰기가 아니다");
});

test("★ 백업에 없는 직원은 사라진다", () => {
  seedStore({
    staff: [staff("st1", "김제빵"), staff("st2", "이바리스타")],
    punches: [],
    contracts: [],
  });
  assert.equal(currentCounts().staff, 2);

  applyRestore({
    kind: "store-note-backup",
    version: BACKUP_VERSION,
    exportedAt: "2026-09-01T00:00:00.000Z",
    storeName: "○○",
    roster: { staff: [staff("st1", "김제빵")], assign: {} },
    punches: {},
    contracts: [],
  });
  const after = buildBackup("○○");
  assert.equal(after.roster.staff.length, 1);
  assert.equal(after.roster.staff[0].name, "김제빵");
});

test("★ 계약도 덮어쓴다 — 시급이 백업 값으로 되돌아간다", () => {
  seedStore({
    staff: [staff("st1", "김제빵")],
    punches: [],
    contracts: [contract("st1", 12_000)], // 지금은 12,000원
  });
  applyRestore({
    kind: "store-note-backup",
    version: BACKUP_VERSION,
    exportedAt: "2026-09-01T00:00:00.000Z",
    storeName: "○○",
    roster: { staff: [staff("st1", "김제빵")], assign: {} },
    punches: {},
    contracts: [contract("st1", 10_500)], // 백업은 10,500원
  });
  assert.equal(buildBackup("○○").contracts[0].hourlyWage, 10_500);
});

test("빈 백업으로 되돌리면 전부 비워진다", () => {
  seedStore({
    staff: [staff("st1", "김제빵")],
    punches: [punch("st1", "2026-09-01")],
    contracts: [contract("st1", 11_000)],
  });
  applyRestore({
    kind: "store-note-backup",
    version: BACKUP_VERSION,
    exportedAt: "2026-09-01T00:00:00.000Z",
    storeName: "○○",
    roster: { staff: [], assign: {} },
    punches: {},
    contracts: [],
  });
  assert.deepEqual(currentCounts(), {
    staff: 0,
    punches: 0,
    contracts: 0,
    cycle: 0,
    salesDays: 0,
    vendors: 0,
    recipes: 0,
    orderDays: 0,
  });
});

/* ---------- 왕복 ---------- */

test("내보내기 → 되돌리기 왕복에서 건수가 유지된다", () => {
  seedStore({
    staff: [staff("st1", "김제빵"), staff("st2", "이바리스타")],
    punches: [punch("st1", "2026-09-01"), punch("st2", "2026-09-02")],
    contracts: [contract("st1", 11_000)],
  });
  const saved = JSON.parse(JSON.stringify(buildBackup("○○")));
  local.clear(); // 태블릿을 잃었다
  assert.deepEqual(currentCounts(), {
    staff: 0,
    punches: 0,
    contracts: 0,
    cycle: 0,
    salesDays: 0,
    vendors: 0,
    recipes: 0,
    orderDays: 0,
  });

  applyRestore(saved);
  assert.deepEqual(currentCounts(), {
    staff: 2,
    punches: 2,
    contracts: 1,
    cycle: 0,
    salesDays: 0,
    vendors: 0,
    recipes: 0,
    orderDays: 0,
  });
});

test("퇴사자 기록도 왕복에서 살아남는다 (3년 보존)", () => {
  seedStore({
    staff: [staff("st1", "김제빵")], // 명단에는 없는
    punches: [punch("st-퇴사자", "2026-08-20")], // 기록만 있는 사람
    contracts: [],
  });
  const saved = JSON.parse(JSON.stringify(buildBackup("○○")));
  local.clear();
  applyRestore(saved);
  const after = buildBackup("○○");
  assert.ok(after.punches["st-퇴사자"], "퇴사자 기록이 사라졌다");
});

/* ---------- 저장 실패 ---------- */

test("★ 저장이 막히면 무엇이 실패했는지 알려준다 (조용히 넘어가지 않는다)", () => {
  seedStore({ staff: [], punches: [], contracts: [] });
  const orig = local.setItem;
  local.setItem = () => {
    throw new Error("QuotaExceeded");
  };
  const r = applyRestore({
    kind: "store-note-backup",
    version: BACKUP_VERSION,
    exportedAt: "2026-09-01T00:00:00.000Z",
    storeName: "○○",
    roster: { staff: [staff("st1", "김제빵")], assign: {} },
    punches: {},
    contracts: [],
  });
  local.setItem = orig;

  assert.equal(r.ok, false);
  assert.deepEqual(r.failed, ["직원 명단", "출퇴근", "근로계약"]);
});

test("일부만 실패해도 실패한 것만 나열한다", () => {
  seedStore({ staff: [], punches: [], contracts: [] });
  const orig = local.setItem.bind(local);
  local.setItem = (k: string, v: string) => {
    if (k === "sop:punch") throw new Error("QuotaExceeded");
    orig(k, v);
  };
  const r = applyRestore({
    kind: "store-note-backup",
    version: BACKUP_VERSION,
    exportedAt: "2026-09-01T00:00:00.000Z",
    storeName: "○○",
    roster: { staff: [staff("st1", "김제빵")], assign: {} },
    punches: toData([punch("st1", "2026-09-01")]),
    contracts: [contract("st1", 11_000)],
  });
  local.setItem = orig;

  assert.equal(r.ok, false);
  assert.deepEqual(r.failed, ["출퇴근"]);
  // 나머지는 들어갔다 — 부분 성공을 숨기지 않는다
  assert.equal(buildBackup("○○").roster.staff.length, 1);
});

/* ------------------------------------------------------------------ *
 * 주기 점검 기록 (백업 v2 · 2026-09-10)
 *
 * ★ 왜 넣었나: 보건증·소방시설·위생교육은 **점검했다는 기록 자체가 증빙**이다.
 *   그런데 그 값은 태블릿 브라우저에만 있어서, 기기를 바꾸거나 사이트 데이터를
 *   지우면 "마지막으로 언제 했는지" 가 통째로 사라진다.
 *
 * ★★ 이 절이 지키는 가장 중요한 것: **v1 백업으로 되돌려도 점검 기록을 안 지운다.**
 *   "덮어쓴다, 합치지 않는다" 는 원칙은 백업이 그 덩이를 담고 있을 때 적용된다.
 *   담은 적도 없는 것을 지우면 그건 덮어쓰기가 아니라 유실이다.
 * ------------------------------------------------------------------ */

const { loadCycleDone, loadCycleEvery, saveCycleDone, saveCycleEvery } = await import(
  "../src/lib/cycleDone.ts"
);

const BASE = {
  kind: "store-note-backup" as const,
  version: BACKUP_VERSION,
  exportedAt: "2026-09-10T00:00:00.000Z",
  storeName: "○○",
  roster: { staff: [], assign: {} },
  punches: {},
  contracts: [],
};

test("★ 백업이 주기 점검 기록을 담는다", () => {
  local.clear();
  saveCycleDone({ "c-4": "2026-05-11" });
  saveCycleEvery({ "c-4": 365 });

  const b = buildBackup("○○");
  assert.deepEqual(b.cycleDone, { "c-4": "2026-05-11" });
  assert.deepEqual(b.cycleEvery, { "c-4": 365 });
  assert.equal(backupCounts(b).cycle, 1);
});

test("주기만 정하고 한 적이 없으면 건수에 안 센다 — 잃을 것이 없다", () => {
  local.clear();
  saveCycleEvery({ "c-4": 365 });
  assert.equal(backupCounts(buildBackup("○○")).cycle, 0);
});

test("★ 되돌리면 점검 기록이 백업 값으로 돌아온다", () => {
  local.clear();
  saveCycleDone({ "c-4": "2020-01-01" });
  saveCycleEvery({ "c-4": 30 });

  const r = applyRestore({
    ...BASE,
    cycleDone: { "c-4": "2026-05-11", "c-10": "2026-03-01" },
    cycleEvery: { "c-4": 365 },
  });

  assert.equal(r.ok, true);
  assert.deepEqual(loadCycleDone(), { "c-4": "2026-05-11", "c-10": "2026-03-01" });
  assert.deepEqual(loadCycleEvery(), { "c-4": 365 });
});

test("★★ v1 백업(점검 칸이 없는 파일)으로 되돌려도 점검 기록을 안 지운다", () => {
  // 담은 적도 없는 것을 지우면 덮어쓰기가 아니라 유실이다.
  // 옛 백업으로 출퇴근만 되돌렸다가 보건증 기록이 사라지면 되찾을 방법이 없다
  local.clear();
  saveCycleDone({ "c-4": "2026-05-11" });
  saveCycleEvery({ "c-4": 365 });

  const v1 = { ...BASE, version: 1 };
  // @ts-expect-error v1 파일에는 이 칸이 아예 없다
  delete v1.cycleDone;

  const r = applyRestore(v1);
  assert.equal(r.ok, true);
  assert.deepEqual(loadCycleDone(), { "c-4": "2026-05-11" }, "v1 되돌리기가 점검 기록을 지웠다");
  assert.deepEqual(loadCycleEvery(), { "c-4": 365 }, "v1 되돌리기가 점검 주기를 지웠다");
});

test("★ 비어 있는 점검 기록을 담은 v2 백업은 덮어쓴다 — '비어 있음' 도 담긴 값이다", () => {
  // 위 규칙은 '칸이 없을 때' 다. 빈 객체가 들어 있으면 그건 의도한 상태다
  local.clear();
  saveCycleDone({ "c-4": "2026-05-11" });

  applyRestore({ ...BASE, cycleDone: {}, cycleEvery: {} });
  assert.deepEqual(loadCycleDone(), {});
});

test("내보내기 → 되돌리기 왕복에서 점검 기록이 살아남는다", () => {
  local.clear();
  saveCycleDone({ "c-1": "2026-05-11", "c-11": "2026-01-20" });
  saveCycleEvery({ "c-1": 120 });

  const file = JSON.parse(JSON.stringify(buildBackup("○○")));
  local.clear();
  assert.deepEqual(loadCycleDone(), {}, "지워진 상태에서 시작해야 왕복이 뜻이 있다");

  applyRestore(file);
  assert.deepEqual(loadCycleDone(), { "c-1": "2026-05-11", "c-11": "2026-01-20" });
  assert.deepEqual(loadCycleEvery(), { "c-1": 120 });
});

test("★ 되돌리기 전에 보여주는 건수에 점검 기록이 들어 있다", () => {
  // 되돌리기는 점검 기록을 덮어쓰는데 경고에는 없었다 (2026-09-10 점검에서 발견).
  // 화면이 "사라지는 것"을 셀 때 이 값을 쓴다
  local.clear();
  saveCycleDone({ "c-4": "2026-05-11", "c-10": "2026-03-01" });
  assert.equal(backupCounts(buildBackup("○○")).cycle, 2);
});

/* ------------------------------------------------------------------ *
 * ★ v3 덩이 — 2026-09-10 까지 **백업에서 통째로 빠져 있던 것들**.
 *
 * 운영 기능 7종을 붙이면서 저장 키가 늘었는데 백업 목록을 같이 안 늘렸다.
 * 매출·거래처 단가·설정·내 레시피·발주 기록이 안 담겼고, 화면은 멀쩡했다.
 * 태블릿이 죽으면 거래처 단가와 매출이 그냥 사라지는 상태였다.
 *
 * 아래가 그때 있었다면 잡혔을 테스트다.
 * ------------------------------------------------------------------ */

/** 운영 화면들이 입력해둔 상태를 흉내낸다 */
function seedOps() {
  local.setItem(
    "sop:sales",
    JSON.stringify({
      "2026-09-01": { date: "2026-09-01", total: 1_250_000, count: 180, material: 300_000, note: "" },
      "2026-09-02": { date: "2026-09-02", total: 980_000, count: 150, material: 250_000, note: "" },
    }),
  );
  local.setItem(
    "sop:vendors",
    JSON.stringify({
      vendors: [{ id: "v1", name: "○○ 유통", phone: "", how: "전화", cutoff: "15:00", days: [1, 3, 5], lead: 1, note: "" }],
      items: [{ id: "vi1", vendorId: "v1", name: "우유", packAmount: 1000, packUnit: "ml", packPrice: 2_400, note: "" }],
    }),
  );
  local.setItem("sop:settings", JSON.stringify({ minWage: 10_320, fiveOrMore: false }));
  local.setItem(
    "sop:recipes",
    JSON.stringify([{ id: "my-1", slug: "my-1", name: "우리집 스콘", yield: "6개", steps: [], items: [] }]),
  );
  local.setItem(
    "sop:orderLog",
    JSON.stringify({ "2026-09-01": { "pt-1": { ordered: true, received: false, memo: "" } } }),
  );
  local.setItem("sop:orderLinks", JSON.stringify({ "pt-1": "v1" }));
}

test("★ 매출·거래처·설정·레시피·발주가 백업에 담긴다 (예전엔 통째로 빠져 있었다)", () => {
  local.clear();
  seedOps();
  const b = buildBackup("○○");

  assert.deepEqual(Object.keys(b.sales ?? {}).sort(), ["2026-09-01", "2026-09-02"]);
  assert.equal((b.vendors?.vendors ?? []).length, 1);
  assert.equal((b.vendors?.items ?? []).length, 1, "품목 단가가 빠지면 원가를 못 되살린다");
  assert.equal(b.settings?.minWage, 10_320);
  assert.equal((b.recipes ?? []).length, 1);
  assert.ok(b.orderLog?.["2026-09-01"], "발주 기록이 안 담겼다");
  assert.equal(b.orderLinks?.["pt-1"], "v1");
});

test("★ 태블릿을 잃어도 거래처 단가가 왕복에서 살아남는다", () => {
  local.clear();
  seedOps();
  const saved = JSON.parse(JSON.stringify(buildBackup("○○")));

  local.clear(); // 태블릿을 잃었다
  assert.equal(buildBackup("○○").vendors?.items.length, 0);

  applyRestore(saved);
  const after = buildBackup("○○");
  // 단가가 살아나야 원가 화면이 다시 돈다. 이게 없으면 전화를 다시 돌려야 한다
  assert.equal(after.vendors?.items[0].packPrice, 2_400);
  assert.equal(after.sales?.["2026-09-01"].total, 1_250_000);
  assert.equal(after.recipes?.[0].name, "우리집 스콘");
});

test("★ v1 백업(옛 파일)으로 되돌려도 v3 덩이를 지우지 않는다", () => {
  /* v1 파일은 매출·거래처를 **담은 적이 없다.** 그걸 '빈 값' 으로 읽고
     덮어쓰면, 그 백업이 담은 적도 없는 거래처 단가를 지우는 셈이 된다. */
  local.clear();
  seedOps();
  applyRestore({
    kind: "store-note-backup",
    version: 1,
    exportedAt: "2026-09-01T00:00:00.000Z",
    storeName: "○○",
    roster: { staff: [], assign: {} },
    punches: {},
    contracts: [],
  });

  const after = buildBackup("○○");
  assert.equal(after.vendors?.items.length, 1, "v1 복원이 거래처 단가를 지웠다");
  assert.equal(Object.keys(after.sales ?? {}).length, 2, "v1 복원이 매출을 지웠다");
});
