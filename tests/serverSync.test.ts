import assert from "node:assert/strict";
import test from "node:test";

import {
  contractToRow,
  flattenPunches,
  nestPunches,
  punchToRow,
  rowToContract,
  rowToPunch,
  rowToStaff,
  staffToRow,
} from "../src/lib/serverSync.ts";
import { ALLOWED_TABLES, isAllowedTable } from "../src/lib/serverData.ts";
import type { Punch, PunchData } from "../src/lib/attendance.ts";
import type { Contract } from "../src/lib/contracts.ts";
import type { Staff } from "../src/lib/roster.ts";
import { newUuid } from "../src/lib/store.ts";

/* ------------------------------------------------------------------ *
 * 브라우저 ↔ 서버 왕복
 *
 * ★ 여기서 칸 하나를 빠뜨리면 **그 값만 조용히 사라진다.** 화면은 멀쩡히
 *   돌고, 기기를 바꾼 날에야 빈 칸을 보게 된다. 그때는 다시 못 모은다.
 *   그래서 «넣었다 빼면 그대로인가» 를 칸 단위로 못 박는다.
 * ------------------------------------------------------------------ */

test("★ 직원 — 왕복해도 그대로다", () => {
  const s: Staff = {
    id: newUuid(),
    section: "바",
    name: "김민수",
    email: "a@b.c",
    phone: "010-0000-0000",
  };
  assert.deepEqual(rowToStaff(staffToRow(s)), s);
});

test("★ 출퇴근 — 왕복해도 그대로다", () => {
  const p: Punch = {
    id: newUuid(),
    staffId: newUuid(),
    date: "2026-09-13",
    inAt: "07:28",
    outAt: "15:40",
    breakMin: 60,
    note: "지각 사유 있음",
  };
  assert.deepEqual(rowToPunch(punchToRow(p)), p);
});

test("★★ 근로계약 — 교부·4대보험이 빠지지 않는다", () => {
  /* 이 둘은 `contracts.ts` 의 법정 점검이 실제로 읽는 값이다.
     빠뜨리면 앱이 「교부 안 했습니다」 라고 거짓으로 경고한다.
     표에 칸이 없어서 `0006_contract_flags.sql` 로 만들었다. */
  const c: Contract = {
    id: newUuid(),
    staffId: newUuid(),
    startDate: "2026-03-01",
    endDate: "",
    hourlyWage: 10320,
    weeklyHours: 40,
    workDays: [1, 2, 3, 4, 5],
    startTime: "09:00",
    endTime: "18:00",
    handedOver: true,
    insured: true,
    note: "수습 3개월",
  };
  const row = contractToRow(c);
  assert.equal(row.handed_over, true, "교부 여부가 안 실렸다");
  assert.equal(row.insured, true, "4대보험이 안 실렸다");
  assert.deepEqual(rowToContract(row), c);
});

test("★ 마감조가 자정을 넘으면 crosses_midnight 이 선다", () => {
  /* 23:00 에 찍고 01:00 에 퇴근한 날. 이 값이 없으면 서버에서
     근로시간이 −22시간으로 나온다 (`attendance.ts` 와 같은 함정) */
  const p: Punch = {
    id: newUuid(),
    staffId: newUuid(),
    date: "2026-09-13",
    inAt: "23:00",
    outAt: "01:00",
    breakMin: 0,
    note: "",
  };
  assert.equal(punchToRow(p).crosses_midnight, true);

  const normal = { ...p, inAt: "07:30", outAt: "15:30" };
  assert.equal(punchToRow(normal).crosses_midnight, false);
});

test("빈 칸은 null 로 보낸다 — 빈 문자열은 시각·날짜 칸에서 거절당한다", () => {
  const p: Punch = {
    id: newUuid(),
    staffId: newUuid(),
    date: "2026-09-13",
    inAt: "07:30",
    outAt: "",
    breakMin: 0,
    note: "",
  };
  const row = punchToRow(p);
  assert.equal(row.out_at, null, "아직 퇴근을 안 찍었으면 null 이어야 한다");
  assert.equal(row.note, null);
});

test("서버가 초까지 돌려줘도 화면이 쓰는 HH:MM 으로 자른다", () => {
  const back = rowToPunch({
    id: newUuid(),
    staff_id: newUuid(),
    business_date: "2026-09-13",
    in_at: "07:28:00",
    out_at: "15:40:00",
    break_min: 60,
    note: null,
  });
  assert.equal(back.inAt, "07:28");
  assert.equal(back.outAt, "15:40");
});

test("★ punches[직원][날짜] 를 폈다가 다시 접어도 그대로다", () => {
  const a = newUuid();
  const b = newUuid();
  const mk = (staffId: string, date: string): Punch => ({
    id: newUuid(),
    staffId,
    date,
    inAt: "07:30",
    outAt: "15:30",
    breakMin: 30,
    note: "",
  });
  const data: PunchData = {
    [a]: { "2026-09-12": mk(a, "2026-09-12"), "2026-09-13": mk(a, "2026-09-13") },
    [b]: { "2026-09-13": mk(b, "2026-09-13") },
  };
  assert.equal(flattenPunches(data).length, 3);
  assert.deepEqual(nestPunches(flattenPunches(data)), data);
});

test("직원·날짜가 없는 줄은 접을 때 버린다 — 어디에도 못 붙는다", () => {
  const bad: Punch = {
    id: newUuid(),
    staffId: "",
    date: "",
    inAt: "",
    outAt: "",
    breakMin: 0,
    note: "",
  };
  assert.deepEqual(nestPunches([bad]), {});
});

test("★ 주소로 아무 표나 부를 수 없다", () => {
  /* `/api/data/[table]` 은 주소 조각을 그대로 표 이름으로 쓴다.
     목록이 없으면 `/api/data/users` 도 열린다 */
  for (const t of ALLOWED_TABLES) assert.ok(isAllowedTable(t));
  for (const t of ["users", "stores", "events", "sales_lines", "../users", ""]) {
    assert.equal(isAllowedTable(t), false, `${t} 가 열려 있다`);
  }
});

test("★ 새로 만드는 id 는 uuid 다 — 서버가 옛 모양을 거절한다", () => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (let i = 0; i < 20; i++) assert.match(newUuid(), uuid);
});
