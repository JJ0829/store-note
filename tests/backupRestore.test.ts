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
  assert.deepEqual(backupCounts(b), { staff: 2, punches: 2, contracts: 1 });
});

test("빈 저장소도 백업된다 (0건 매장)", () => {
  local.clear();
  assert.deepEqual(currentCounts(), { staff: 0, punches: 0, contracts: 0 });
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
  assert.deepEqual(currentCounts(), { staff: 0, punches: 0, contracts: 0 });
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
  assert.deepEqual(currentCounts(), { staff: 0, punches: 0, contracts: 0 });

  applyRestore(saved);
  assert.deepEqual(currentCounts(), { staff: 2, punches: 2, contracts: 1 });
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
