/* ------------------------------------------------------------------ *
 * 내보내기 · 되돌리기.
 *
 * 여기서 놓치면 3년 보존 대상이 사라지거나, 사장님이 파일을 열어보고
 * "안 된다"고 판단한다. 고정해야 할 것은 네 덩이다.
 *
 *   1) 엑셀에서 한글이 안 깨진다 (BOM)
 *   2) 메모 칸이 엑셀 수식으로 실행되지 않는다
 *   3) 퇴사자 기록을 버리지 않는다
 *   4) 이상한 파일로는 되돌리지 않는다 (덮어쓰기라서)
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_VERSION,
  checkRestore,
  contractRows,
  csvCell,
  csvSafe,
  punchRows,
  toCsv,
  today,
  type BackupFile,
} from "../src/lib/backup.ts";
import type { Punch, PunchData } from "../src/lib/attendance.ts";
import type { Contract } from "../src/lib/contracts.ts";
import type { Staff } from "../src/lib/roster.ts";

const staff: Staff[] = [
  { id: "st1", section: "제빵", name: "김제빵", email: "a@b.c", phone: "010" },
  { id: "st2", section: "바", name: "이바리스타", email: "", phone: "" },
];

function punch(over: Partial<Punch> = {}): Punch {
  return {
    id: "pu1",
    staffId: "st1",
    date: "2026-09-01",
    inAt: "07:28",
    outAt: "15:40",
    breakMin: 30,
    note: "",
    ...over,
  };
}

function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: "ct1",
    staffId: "st1",
    startDate: "2026-01-02",
    endDate: "",
    hourlyWage: 11_000,
    weeklyHours: 20,
    workDays: [1, 3, 5],
    startTime: "09:00",
    endTime: "14:00",
    handedOver: true,
    insured: true,
    note: "",
    ...over,
  };
}

function data(list: Punch[]): PunchData {
  const out: PunchData = {};
  for (const p of list) {
    out[p.staffId] = { ...(out[p.staffId] ?? {}), [p.date]: p };
  }
  return out;
}

/* ---------- 1) 엑셀에서 한글 ---------- */

test("★ CSV 맨 앞에 BOM이 붙는다 — 없으면 엑셀에서 한글이 깨진다", () => {
  const csv = toCsv([["직원명"], ["김제빵"]]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
});

test("줄은 CRLF로 나눈다 (엑셀 기준)", () => {
  const csv = toCsv([["a"], ["b"]]);
  assert.ok(csv.includes("\r\n"));
});

/* ---------- 2) 엑셀 수식 주입 ---------- */

test("★ =로 시작하는 메모는 수식으로 실행되지 않게 막는다", () => {
  assert.equal(csvSafe("=1+1"), "'=1+1");
});

test("+ - @ 탭 캐리지리턴도 같이 막는다", () => {
  for (const bad of ["+1", "-1", "@SUM(A1)", "\tx", "\rx"]) {
    assert.equal(csvSafe(bad)[0], "'", `막지 못했다: ${JSON.stringify(bad)}`);
  }
});

test("보통 글자는 건드리지 않는다 — 멀쩡한 메모에 따옴표가 붙으면 안 된다", () => {
  assert.equal(csvSafe("지각 사유 있음"), "지각 사유 있음");
  assert.equal(csvSafe("07:28"), "07:28");
});

test("수식 주입이 실제 내보내기 경로에서도 막힌다", () => {
  const rows = punchRows(data([punch({ note: "=cmd|' /C calc'!A0" })]), staff);
  const csv = toCsv(rows);
  assert.ok(!csv.includes(",=cmd"), "수식이 그대로 나갔다");
  assert.ok(csv.includes("'=cmd"), "앞에 따옴표가 안 붙었다");
});

/* ---------- CSV 규칙 ---------- */

test("쉼표·따옴표·줄바꿈이 있으면 감싸고 안쪽 따옴표는 두 번", () => {
  assert.equal(csvCell("가,나"), '"가,나"');
  assert.equal(csvCell('그가 "왜"'), '"그가 ""왜"""');
  assert.equal(csvCell("한 줄\n두 줄"), '"한 줄\n두 줄"');
});

test("참/거짓은 예/아니오로 — 심사·노무 자료를 사람이 읽는다", () => {
  assert.equal(csvCell(true), "예");
  assert.equal(csvCell(false), "아니오");
});

/* ---------- 3) 기록을 버리지 않는다 ---------- */

test("★ 명단에서 지운 퇴사자의 출퇴근도 남긴다 (3년 보존 대상이다)", () => {
  const rows = punchRows(data([punch({ staffId: "st-없는사람" })]), staff);
  assert.equal(rows.length, 2); // 머리글 + 1건
  assert.equal(rows[1][0], "(명단에 없음)");
  assert.equal(rows[1][7], "st-없는사람"); // 직원ID는 그대로 남는다
});

test("출퇴근은 날짜순으로 정렬한다", () => {
  const rows = punchRows(
    data([
      punch({ staffId: "st1", date: "2026-09-03" }),
      punch({ staffId: "st2", date: "2026-09-01" }),
    ]),
    staff,
  );
  assert.equal(rows[1][2], "2026-09-01");
  assert.equal(rows[2][2], "2026-09-03");
});

test("★ 종료일이 비면 '기간의 정함 없음'으로 적는다 — 빈 칸은 뜻이 다르다", () => {
  const rows = contractRows([contract({ endDate: "" })], staff);
  assert.equal(rows[1][3], "기간의 정함 없음");
});

test("근무요일 숫자를 한글 요일로 편다", () => {
  const rows = contractRows([contract({ workDays: [5, 1, 3] })], staff);
  assert.equal(rows[1][6], "월 수 금");
});

/* ---------- 4) 되돌리기 거부 조건 ---------- */

function good(over: Partial<BackupFile> = {}): string {
  const f: BackupFile = {
    kind: "store-note-backup",
    version: BACKUP_VERSION,
    exportedAt: "2026-09-07T00:00:00.000Z",
    storeName: "○○ 베이커리 카페",
    roster: { staff, assign: {} },
    punches: data([punch()]),
    contracts: [contract()],
    ...over,
  };
  return JSON.stringify(f);
}

test("제대로 된 백업은 통과하고 건수를 돌려준다", () => {
  const r = checkRestore(good());
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.counts, { staff: 2, punches: 1, contracts: 1 });
});

test("★ JSON이 아니면 거부한다", () => {
  const r = checkRestore("직원명,날짜\n김제빵,2026-09-01");
  assert.equal(r.ok, false);
});

test("★ 다른 앱의 JSON은 거부한다 — kind를 확인한다", () => {
  const r = checkRestore(JSON.stringify({ staff: [], punches: {} }));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.reason.includes("매장수첩"));
});

test("★ 더 새로운 형식은 거부한다 — 모르는 모양을 덮어쓰면 안 된다", () => {
  const r = checkRestore(good({ version: BACKUP_VERSION + 1 }));
  assert.equal(r.ok, false);
});

test("★ 항목이 빠진 백업은 부분 복원하지 않고 거부한다", () => {
  for (const broken of [
    good({ contracts: undefined as unknown as Contract[] }),
    good({ punches: undefined as unknown as PunchData }),
    good({ roster: undefined as unknown as BackupFile["roster"] }),
    good({ roster: { staff: undefined as unknown as Staff[], assign: {} } }),
  ]) {
    assert.equal(checkRestore(broken).ok, false);
  }
});

test("빈 백업은 거부하지 않는다 — 0건인 매장도 되돌릴 수 있어야 한다", () => {
  const r = checkRestore(good({ roster: { staff: [], assign: {} }, punches: {}, contracts: [] }));
  assert.equal(r.ok, true);
});

/* ---------- 파일명 ---------- */

test("파일명 날짜는 로컬 날짜다 (UTC로 밀리면 하루 전 파일이 된다)", () => {
  // 로컬 자정 직후. toISOString()을 쓰면 전날로 밀린다
  const d = new Date(2026, 8, 7, 0, 30);
  assert.equal(today(d), "2026-09-07");
});
