import assert from "node:assert/strict";
import test from "node:test";

import {
  contractToRow,
  flattenPunches,
  nestPunches,
  punchToRow,
  rowToContract,
  rowToPunch,
  oldStyleStaff,
  pushStaff,
  rowToStaff,
  hasRows,
  rowToSales,
  salesToRow,
  staffToRow,
} from "../src/lib/serverSync.ts";
import { ALLOWED_TABLES, CONFLICT_KEY, isAllowedTable } from "../src/lib/serverData.ts";
import fs from "node:fs";
import path from "node:path";
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

test("★ 옛 방식 id 로 만든 직원은 «왜 안 되는지» 를 말한다", async () => {
  /* 2026-09-14 — 직원 3명을 넣었는데 서버에 한 줄도 안 들어갔다.
     uuid 로 바꾸기 **전에** 만든 직원이라 서버가 400 으로 거절했는데,
     화면에는 「보내지 못했습니다」 로만 보여서 원인을 알 수 없었다. */
  const oldOne: Staff = {
    id: "st-a1b2c3",
    section: "바",
    name: "김민수",
    email: "",
    phone: "",
  };
  const newOne: Staff = { ...oldOne, id: newUuid(), name: "이서연" };

  assert.deepEqual(oldStyleStaff([oldOne, newOne]), [oldOne]);
  assert.deepEqual(oldStyleStaff([newOne]), []);

  const r = await pushStaff([oldOne, newOne]);
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.reason.includes("김민수"), "누구 때문인지 이름을 말해야 한다");
  assert.ok(!r.ok && r.reason.includes("다시 넣어"), "무엇을 하라는지 말해야 한다");
  assert.ok(!r.ok && !r.reason.includes("이서연"), "멀쩡한 직원까지 탓하면 안 된다");
});

/* ------------------------------------------------------------------ *
 * 매출 (2026-09-14)
 *
 * ★ 다른 표와 다른 점 — **줄에 id 가 없다.** 화면의 매출은 «날짜 → 하루치»다.
 *   그래서 같은 줄인지 보는 열쇠가 `id` 가 아니라 `(store_id, business_date)` 다.
 *   `id` 로 맞추면 마감을 고칠 때마다 줄이 쌓이고 유일 제약에 걸려
 *   **조용히 실패한다.**
 * ------------------------------------------------------------------ */

test("★ 매출은 매장+영업일로 같은 줄을 찾는다 (id 가 아니다)", () => {
  assert.equal(CONFLICT_KEY.daily_sales, "store_id,business_date");
  /* 나머지는 줄마다 id 가 있으므로 id 로 맞춘다 */
  for (const t of ["staff", "punches", "contracts"] as const) {
    assert.equal(CONFLICT_KEY[t], "id");
  }
});

test("★ 매출의 네 숫자가 하나도 안 빠진다 (재료비 포함)", () => {
  const row = salesToRow({
    date: "2026-09-14",
    total: 1_250_000,
    count: 87,
    material: 410_000,
    note: "비",
  });
  assert.equal(row.business_date, "2026-09-14");
  assert.equal(row.total_amount, 1_250_000);
  assert.equal(row.ticket_count, 87);
  /* ★ 빠지면 서버의 「남은 돈」이 실제보다 커진다 */
  assert.equal(row.material_cost, 410_000, "재료비가 빠졌다");
  assert.equal(row.memo, "비");
});

test("매출 왕복해도 값이 안 변한다", () => {
  const d = { date: "2026-09-14", total: 990_000, count: 60, material: 300_000, note: "메모" };
  assert.deepEqual(rowToSales(salesToRow(d)), d);
});

test("매출: 빈 칸은 0 · 빈 메모는 null", () => {
  assert.equal(salesToRow({ date: "2026-09-14", total: 0, count: 0, material: 0, note: "  " }).memo, null);
  assert.deepEqual(
    rowToSales({ business_date: "2026-09-14", total_amount: null, ticket_count: null, material_cost: null, memo: null }),
    { date: "2026-09-14", total: 0, count: 0, material: 0, note: "" },
  );
});

test("★ 매출 화면이 글자마다 서버로 보내지 않는다", () => {
  const view = fs
    .readFileSync(path.join(process.cwd(), "src/components/SalesView.tsx"), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(view, /setTimeout/, "기다리지 않고 바로 보낸다 — 중간 값이 최종값을 덮는다");
  assert.match(view, /clearTimeout/, "이전 예약을 취소하지 않는다");
});

/* ------------------------------------------------------------------ *
 * ★★ 빈 서버로 태블릿을 덮지 않는다 (2026-09-15 · 실제로 기록이 지워졌다)
 *
 *   `pullPunches()` 는 서버가 비면 `{}` 를 돌려주는데 `{}` 는 **참**이라
 *   `if (!server) return;` 를 통과했다. 그래서 로그인한 순간
 *   `savePunches({})` 가 돌고 어제 찍은 출퇴근 6건이 통째로 날아갔다.
 *   서버도 여전히 비어서 «로그인했더니 기록만 없어졌다» 로 보였다.
 * ------------------------------------------------------------------ */

test("★ 빈 것을 «있다» 로 보지 않는다 — 이것 때문에 기록이 지워졌다", () => {
  assert.equal(hasRows({}), false, "빈 객체가 참이라 덮어쓰기가 돌았다");
  assert.equal(hasRows([]), false, "빈 배열도 마찬가지다");
  assert.equal(hasRows(null), false);
  assert.equal(hasRows(undefined), false);
  assert.equal(hasRows({ "s-1": {} }), true);
  assert.equal(hasRows([{ id: "x" }]), true);
});

test("★ 세 화면 모두 빈 서버로 덮어쓰지 않는다", () => {
  for (const [file, saveFn] of [
    ["src/components/AttendanceView.tsx", "savePunches"],
    ["src/components/ContractView.tsx", "saveContracts"],
    ["src/components/SalesView.tsx", "saveSales"],
  ] as const) {
    const src = fs
      .readFileSync(path.join(process.cwd(), file), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    /* 덮어쓰기는 반드시 `hasRows(server)` 안에서만 일어나야 한다 */
    assert.match(src, /if \(hasRows\(server\)\)/, `${file} 에 빈 서버 방어가 없다`);
    assert.match(
      src,
      /server === null/,
      `${file} 이 «로그인 안 함(null)» 과 «비어 있음» 을 안 나눈다`,
    );
    assert.ok(src.includes(saveFn), `${file} 에서 ${saveFn} 를 못 찾았다`);
  }
});

test("★ 서버가 비어 있으면 태블릿 것을 올린다 (첫 로그인에 채워져야 한다)", () => {
  /* 이게 없으면 로그인한 뒤 버튼을 한 번 더 눌러야만 올라가고,
     그 전까지 서버는 영영 빈 깡통이다 — 사장님이 본 그 상태다 */
  for (const file of [
    "src/components/AttendanceView.tsx",
    "src/components/ContractView.tsx",
    "src/components/SalesView.tsx",
  ]) {
    const src = fs
      .readFileSync(path.join(process.cwd(), file), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    assert.match(
      src,
      /if \(hasRows\(mine\)\) sendUp\(mine/,
      `${file} 이 «서버가 비면 올리기» 를 안 한다`,
    );
  }
});
