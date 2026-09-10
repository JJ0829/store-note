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
  assert.deepEqual(r.counts, { staff: 2, punches: 1, contracts: 1, cycle: 0 });
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

/* ------------------------------------------------------------------ *
 * 재촉 — 조용해야 할 때 조용한가                                       *
 *
 * 이 로직에서 중요한 건 "경고가 뜨는가"가 아니라 **안 떠야 할 때 안 뜨는가**다.
 * 쓸데없이 뜨는 경고를 두세 번 보면 사람은 경고 자체를 무시하기 시작하고,
 * 그때부터 진짜 경고도 안 보인다. `PrepView`가 되돌릴 수 없는 항목만
 * 빨갛게 띄우는 것과 같은 이유다.
 * ------------------------------------------------------------------ */

import {
  DANGER_DAYS,
  WARN_DAYS,
  backupStatus,
  recordDates,
} from "../src/lib/backup.ts";

const NOW = new Date(2026, 8, 20, 18, 0); // 2026-09-20 18:00

/** 기준일부터 뒤로 n일치 날짜 (오늘 제외) */
function daysBefore(n: number, from: Date = NOW): string[] {
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() - i);
    const p = (x: number) => String(x).padStart(2, "0");
    out.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  }
  return out.sort();
}

test("★ 기록이 없으면 재촉하지 않는다 (빈 백업을 받게 만들지 않는다)", () => {
  const s = backupStatus([], null, NOW);
  assert.equal(s.level, "none");
  assert.equal(s.unbackedDays, 0);
});

test("★ 오늘 하루만 넣은 기기는 조용하다 (시연·심사 기기가 이 경우다)", () => {
  const p = (x: number) => String(x).padStart(2, "0");
  const today = `${NOW.getFullYear()}-${p(NOW.getMonth() + 1)}-${p(NOW.getDate())}`;
  const s = backupStatus([today], null, NOW);

  // 오늘은 아직 마감을 안 했으므로 "백업 안 된 기록"으로 세지 않는다
  assert.equal(s.unbackedDays, 0);
  assert.equal(s.level, "none");
});

test("★ 문 닫고 쉬는 주에는 재촉하지 않는다", () => {
  // 2주 전에 백업했고, 그 뒤로 기록이 하나도 안 쌓였다
  const dates = daysBefore(3, new Date(2026, 8, 6));
  const s = backupStatus(dates, new Date(2026, 8, 6, 22, 0).toISOString(), NOW);

  assert.equal(s.unbackedDays, 0);
  assert.equal(s.level, "none");
  assert.match(s.message, /새로 쌓인 기록이 없습니다/);
});

test("6일치까지는 첫 화면에 안 띄운다 (info)", () => {
  const s = backupStatus(daysBefore(6), null, NOW);
  assert.equal(s.unbackedDays, 6);
  assert.equal(s.level, "info");
});

test(`${WARN_DAYS}일치부터 경고한다`, () => {
  assert.equal(backupStatus(daysBefore(WARN_DAYS), null, NOW).level, "warn");
  assert.equal(backupStatus(daysBefore(WARN_DAYS - 1), null, NOW).level, "info");
});

test(`${DANGER_DAYS}일치부터 빨간 단계`, () => {
  assert.equal(backupStatus(daysBefore(DANGER_DAYS), null, NOW).level, "danger");
  assert.equal(
    backupStatus(daysBefore(DANGER_DAYS - 1), null, NOW).level,
    "warn",
  );
});

test("★ 마지막 백업 이후에 생긴 것만 센다", () => {
  // 30일치가 있지만 5일 전에 백업했다 → 4일치만 남는다 (오늘 제외)
  const dates = daysBefore(30);
  const last = new Date(2026, 8, 15, 22, 0).toISOString(); // 09-15
  const s = backupStatus(dates, last, NOW);

  assert.equal(s.unbackedDays, 4); // 09-16 ~ 09-19
  assert.equal(s.level, "info");
});

test("백업한 날 자체의 기록은 담긴 것으로 본다 (마감 후에 받는다)", () => {
  const s = backupStatus(["2026-09-15"], new Date(2026, 8, 15, 22, 0).toISOString(), NOW);
  assert.equal(s.unbackedDays, 0);
});

test("한 번도 안 받았으면 문장이 다르다", () => {
  assert.match(backupStatus(daysBefore(8), null, NOW).message, /한 번도 받지 않았/);
  assert.match(
    backupStatus(daysBefore(8), new Date(2026, 8, 1).toISOString(), NOW).message,
    /마지막 백업 뒤로/,
  );
});

test("★ 한국 시간 새벽에도 날짜가 안 밀린다 (UTC로 자르지 않는다)", () => {
  // 한국 09-20 01:00 = UTC 09-19 16:00. UTC 기준으로 오늘을 잡으면
  // 09-19가 "오늘"이 되어 하루치가 사라진다
  const dawn = new Date(2026, 8, 20, 1, 0);
  const s = backupStatus(["2026-09-19", "2026-09-20"], null, dawn);

  assert.equal(s.unbackedDays, 1); // 09-19만. 09-20은 오늘이라 안 셈
});

test("출퇴근과 매출의 날짜를 합쳐서 센다 (중복은 한 번)", () => {
  const punches = {
    st1: { "2026-09-18": {}, "2026-09-19": {} },
    st2: { "2026-09-19": {} },
  };
  const sales = { "2026-09-19": {}, "2026-09-17": {} };

  assert.deepEqual(recordDates(punches, sales), [
    "2026-09-17",
    "2026-09-18",
    "2026-09-19",
  ]);
});

test("날짜가 아닌 키는 무시한다 (설정·id가 섞여 들어와도 안 센다)", () => {
  assert.deepEqual(
    recordDates({ st1: { "2026-09-19": {}, note: {}, "9/19": {} } }, { total: {} }),
    ["2026-09-19"],
  );
});

test("빈 값·없는 값이 들어와도 안 죽는다", () => {
  assert.deepEqual(recordDates({}, {}), []);
  assert.deepEqual(
    recordDates(
      undefined as unknown as Record<string, Record<string, unknown>>,
      undefined as unknown as Record<string, unknown>,
    ),
    [],
  );
});
