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
  pushContracts,
  pushStaff,
  readyContracts,
  rowToStaff,
  hasRows,
  REPLACE_DELETE_ORDER,
  rowToSales,
  rowToVendor,
  rowsToItem,
  itemToRow,
  itemVersionToRow,
  pushVendors,
  unknownUnitItems,
  vendorToRow,
  SHIFT_UUID,
  assignToRows,
  rowsToAssign,
  salesToRow,
  staffToRow,
} from "../src/lib/serverSync.ts";
import { ALLOWED_TABLES, CONFLICT_KEY, isAllowedTable } from "../src/lib/serverData.ts";
import fs from "node:fs";
import path from "node:path";
import type { Punch, PunchData } from "../src/lib/attendance.ts";
import type { Contract } from "../src/lib/contracts.ts";
import type { Staff } from "../src/lib/roster.ts";
import type { Vendor, VendorItem } from "../src/lib/vendors.ts";
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

test("★ 서버로 보내는 화면 셋 모두 글자마다 보내지 않는다 (먼저 것이 나중에 도착하면 옛 값이 남는다)", () => {
  /* 2026-09-16 실측 — 계약 화면에서 시작일·시급을 잇따라 치자 PUT 둘이 거의 동시에
     나가서 먼저 것이 나중에 도착했다. 태블릿은 10,320 · 서버는 0.00.
     매출에만 있던 1.2초 기다리기를 셋 다에 둔다. */
  for (const file of [
    "src/components/SalesView.tsx",
    "src/components/ContractView.tsx",
    "src/components/AttendanceView.tsx",
  ]) {
    const view = fs
      .readFileSync(path.join(process.cwd(), file), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    assert.match(view, /setTimeout\(/, `${file}: 기다리지 않고 바로 보낸다`);
    assert.match(view, /clearTimeout\(upTimer\.current\)/, `${file}: 이전 예약을 취소하지 않는다`);
  }
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

/* ------------------------------------------------------------------ *
 * ★★ 직원은 근무표 화면이 **스스로** 올린다 (2026-09-16)
 *
 *   전에는 직원이 출퇴근·계약을 보낼 때 딸려서만 올라갔다. 그래서
 *   출퇴근도 계약도 0건인 매장은 직원 4명이 있어도 서버 `staff` 가 영영
 *   비어 있었다 — «폴더가 다 깡통» 의 절반이 이것이었다.
 * ------------------------------------------------------------------ */
test("★ 근무표 화면이 직원과 배정을 직접 올린다 (출퇴근·계약에 딸려서만이 아니라)", () => {
  /* ★ 2026-09-16 — 배정(`assign`)까지 같이 올리게 바뀌었다. 근무표는 주에
     한 번 짜는 것이라 잃으면 그 주를 통째로 다시 짜야 하고, 배정이 없으면
     근태(계획 − 실제)를 아예 못 만든다. 그래서 `pullStaff` → `pullRoster`. */
  const src = fs
    .readFileSync(path.join(process.cwd(), "src/components/RosterView.tsx"), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(src, /pullRoster\(\)/, "화면을 열 때 서버에서 근무표를 받지 않는다");
  assert.match(src, /hasRows\(server\.staff\)/, "빈 서버로 직원 명단을 덮어쓸 수 있다");
  assert.match(src, /hasRows\(server\.assign\)/, "빈 서버로 배정을 덮어쓸 수 있다");
  assert.match(src, /sendUp\(mine\)/, "서버가 비면 태블릿 것을 올리지 않는다");
  /* 저장하는 길이 하나로 모였다 — `persist` 가 서버까지 보낸다.
     두 곳에서 부르면 같은 것을 두 번 보낸다 */
  assert.match(src, /saveRoster\(next\),[\s\S]{0,120}sendUp\(next\)/, "persist 가 서버로 안 보낸다");
  assert.doesNotMatch(src, /sendStaff\(/, "옛 sendStaff 가 남아 있다");
});

/* ------------------------------------------------------------------ *
 * ★ 시작일 없는 계약 초안은 보내지 않는다 (2026-09-16 · 실측으로 잡힘)
 *
 *   「+ 정영호」 를 누른 순간 `startDate: ""` 인 초안이 서버로 갔고
 *   `start_date date not null` 이 거절했다 — `invalid input syntax for type date: ""`.
 *   화면에는 「저장에 실패했습니다」. 아무것도 안 적은 초안에 실패 경고는 소음이다.
 * ------------------------------------------------------------------ */
test("★ 시작일 없는 계약 초안은 걸러진다 — 서버가 빈 날짜를 거절한다", () => {
  const draft: Contract = {
    id: newUuid(), staffId: newUuid(), startDate: "", endDate: "",
    hourlyWage: 0, weeklyHours: 0, workDays: [], startTime: "", endTime: "",
    handedOver: false, insured: false, note: "",
  };
  const done: Contract = { ...draft, id: newUuid(), startDate: "2026-09-01", hourlyWage: 10320 };
  assert.deepEqual(readyContracts([draft, done]), [done]);
  assert.deepEqual(readyContracts([draft]), []);
  /* 공백만 있는 것도 없는 것이다 */
  assert.deepEqual(readyContracts([{ ...draft, startDate: "   " }]), []);
});

test("★ 초안만 있으면 «보냈다 0줄» 로 조용히 넘어간다 (실패 경고를 띄우지 않는다)", async () => {
  const draft: Contract = {
    id: newUuid(), staffId: newUuid(), startDate: "", endDate: "",
    hourlyWage: 0, weeklyHours: 0, workDays: [], startTime: "", endTime: "",
    handedOver: false, insured: false, note: "",
  };
  const r = await pushContracts([draft]);
  assert.deepEqual(r, { ok: true, rows: 0 });
});

/* ------------------------------------------------------------------ *
 * ★ 되돌리기는 서버도 덮어쓴다 (2026-09-16)
 *   태블릿만 덮어쓰면 다음 화면에서 「서버가 이긴다」 규칙이 되돌린 것을 도로 지운다.
 *   시연 데이터를 넣고 근무표를 열면 옛 직원이 되살아나는 것이 그 증상이었다.
 * ------------------------------------------------------------------ */
test("★ 비우는 순서 — 직원을 가리키는 표(출퇴근·계약)가 직원보다 먼저다 (거꾸로면 FK 에 걸린다)", () => {
  const order: string[] = [...REPLACE_DELETE_ORDER];
  assert.ok(order.indexOf("punches") < order.indexOf("staff"));
  assert.ok(order.indexOf("contracts") < order.indexOf("staff"));
  /* 서버에 올리는 표 넷을 하나도 안 빠뜨린다 — 빠뜨린 표는 옛 것이 남는다 */
  assert.deepEqual([...order].sort(), [...ALLOWED_TABLES].sort());
});

test("★ 되돌리기 「덮어쓰기」 가 서버까지 간다 — 태블릿에 넣은 뒤 replaceAll 을 부른다", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/components/BackupView.tsx"), "utf-8");
  const a = src.indexOf("applyRestore(stage.file)");
  const b = src.indexOf("replaceAll(stage.file)");
  assert.ok(a > 0 && b > a, "태블릿에 넣은 뒤 서버로 가야 한다");
  /* 실패를 삼키지 않는다 — 어느 단계에서 왜 인지 화면에 쓴다 */
  assert.ok(src.includes("stage.server.step") && src.includes("stage.server.reason"));
});

test("★ 비우기 길은 되돌리기 전용이다 — 화면을 열 때 부르는 곳이 없다", () => {
  for (const v of ["RosterView", "AttendanceView", "ContractView", "SalesView"]) {
    const src = fs.readFileSync(path.join(process.cwd(), `src/components/${v}.tsx`), "utf-8");
    assert.ok(!src.includes("replaceAll"), `${v} 가 서버를 비운다`);
  }
  const route = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/data/[table]/route.ts"),
    "utf-8",
  );
  assert.ok(route.includes("export async function DELETE"), "비우기 길이 없다");
  assert.ok(route.includes("store_id=eq."), "이 매장 것만 지워야 한다");
});

/* ------------------------------------------------------------------ *
 * 거래처 · 단가 (2026-09-16)
 *
 * ★ 앱의 품목 하나가 서버 표 **둘**로 갈라진다. 칸이 하나 빠지면 원가가
 *   조용히 틀리고, 사장님은 그 숫자로 판매가를 정한다.
 * ------------------------------------------------------------------ */

test("★ 거래처 — 왕복해도 그대로다", () => {
  const v: Vendor = {
    id: newUuid(),
    name: "△△ 로스터리",
    phone: "010-1111-2222",
    contact: "김대리",
    how: "카톡",
    cutoff: "12:00",
    deliverDays: [1, 2, 3, 4, 5],
    leadDays: 2,
    note: "5kg 이상 배송비 없음",
  };
  assert.deepEqual(rowToVendor(vendorToRow(v)), v);
});

test("★★ 품목 — 표 둘로 갈라졌다가 다시 하나로 합쳐진다", () => {
  const i: VendorItem = {
    id: newUuid(),
    vendorId: newUuid(),
    name: "우유",
    packAmount: 1000,
    packUnit: "ml",
    packPrice: 2900,
    note: "1L 팩",
  };
  const back = rowsToItem(itemToRow(i), itemVersionToRow(i));
  assert.deepEqual(back, i, "갈랐다 합치면 그대로여야 한다");
});

test("★ 단가 줄의 id 는 품목 id 와 같다 — 다르면 기간이 겹쳐 거절된다", () => {
  /* `item_versions` 에 EXCLUDE (item_id =, validity &&) 가 걸려 있다.
     단가를 고칠 때마다 새 id 로 보내면 같은 품목에 기간이 겹친 줄이
     둘이 되어 **조용히 실패한다.** */
  const i: VendorItem = {
    id: newUuid(), vendorId: newUuid(), name: "설탕",
    packAmount: 15000, packUnit: "g", packPrice: 21000, note: "",
  };
  const ver = itemVersionToRow(i);
  assert.equal(ver.id, i.id);
  assert.equal(ver.item_id, i.id);
});

test("★ 품목의 계열이 두 표에서 같다 — 다르면 외래키가 통째로 거절한다", () => {
  /* `item_versions(item_id, store_id, pack_family)` →
     `items(id, store_id, base_family)` 외래키가 걸려 있다 */
  for (const unit of ["g", "kg", "ml", "L", "개"]) {
    const i: VendorItem = {
      id: newUuid(), vendorId: newUuid(), name: "x",
      packAmount: 1, packUnit: unit, packPrice: 1, note: "",
    };
    assert.equal(itemToRow(i).base_family, itemVersionToRow(i).pack_family, unit);
  }
});

test("★ 사는 물건은 purchased 다 — 아니면 체크 제약에 걸린다", () => {
  const i: VendorItem = {
    id: newUuid(), vendorId: newUuid(), name: "버터",
    packAmount: 1000, packUnit: "g", packPrice: 14000, note: "",
  };
  assert.equal(itemToRow(i).kind, "purchased");
});

test("★ 서버가 모르는 단위는 «무엇을 고르라» 고 말한다", async () => {
  /* 앱은 `장`·`팩`·`봉` 도 받지만 서버 `units` 에는 없다. 그냥 보내면
     외래키에 걸려 「보내지 못했습니다」 로만 보인다 */
  const bad: VendorItem = {
    id: newUuid(), vendorId: newUuid(), name: "김",
    packAmount: 10, packUnit: "봉", packPrice: 5000, note: "",
  };
  const good: VendorItem = { ...bad, id: newUuid(), name: "소금", packUnit: "g" };

  assert.deepEqual(unknownUnitItems([bad, good]), [bad]);
  assert.deepEqual(unknownUnitItems([good]), []);

  const r = await pushVendors({ vendors: [], items: [bad, good] });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.reason.includes("김"), "어느 품목인지 말해야 한다");
  assert.ok(!r.ok && r.reason.includes("봉"), "어느 단위가 문제인지 말해야 한다");
  assert.ok(!r.ok && !r.reason.includes("소금"), "멀쩡한 품목까지 탓하면 안 된다");
});

test("★ 시연 데이터의 거래처·품목 id 가 uuid 다", () => {
  /* 아니면 「시연 데이터 넣기」 를 눌러도 서버에는 한 건도 안 올라간다 */
  const raw = fs.readFileSync(path.join(process.cwd(), "public/demo-backup.json"), "utf8");
  const dump = JSON.parse(raw) as {
    vendors?: { vendors: { id: string }[]; items: { id: string }[] };
  };
  const v = dump.vendors;
  assert.ok(v, "시연 데이터에 거래처가 없다");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const x of v.vendors) assert.match(x.id, uuid, "거래처 id");
  for (const x of v.items) assert.match(x.id, uuid, "품목 id");
  assert.ok(v.vendors.length > 0 && v.items.length > 0);
});

/* ------------------------------------------------------------------ *
 * 근무표 (2026-09-16)
 * ------------------------------------------------------------------ */

test("★ 시드의 조가 전부 붙박이 uuid 를 갖는다", () => {
  /* 하나라도 빠지면 **그 조의 배정만 통째로 안 올라간다.**
     화면은 멀쩡하고, 기기를 바꾼 날에야 그 조가 비어 있다 */
  const raw = fs.readFileSync(path.join(process.cwd(), "data/seed.json"), "utf8");
  const seed = JSON.parse(raw) as { shifts: { id: string; name: string }[] };
  const missing = seed.shifts.filter((s) => !SHIFT_UUID[s.id]);
  assert.deepEqual(missing, [], "붙박이 uuid 가 없는 조가 있다 — SHIFT_UUID 에 더할 것");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const id of Object.values(SHIFT_UUID)) assert.match(id, uuid);
  assert.equal(new Set(Object.values(SHIFT_UUID)).size, Object.keys(SHIFT_UUID).length, "겹치는 uuid");
});

test("★ 배정 — 왕복해도 그대로다 (휴무 포함)", () => {
  const a = newUuid();
  const b = newUuid();
  const shifts = [
    { id: "sh-open", name: "오픈조", start: "07:30", end: "15:30", note: "", focus: [] },
    { id: "sh-close", name: "마감조", start: "14:30", end: "22:30", note: "", focus: [] },
  ] as unknown as Parameters<typeof assignToRows>[1];

  const assign: Record<string, Record<string, string>> = {
    [a]: { "2026-09-16": "오픈조", "2026-09-17": "" },
    [b]: { "2026-09-16": "마감조" },
  };
  assert.deepEqual(rowsToAssign(assignToRows(assign, shifts)), assign);
});

test("★★ 휴무도 줄을 남긴다 — 빼면 «아직 안 짰다» 와 구별이 안 된다", () => {
  const a = newUuid();
  const shifts = [
    { id: "sh-open", name: "오픈조", start: "07:30", end: "15:30", note: "", focus: [] },
  ] as unknown as Parameters<typeof assignToRows>[1];
  const rows = assignToRows({ [a]: { "2026-09-17": "" } }, shifts);
  assert.equal(rows.length, 1, "휴무 줄이 사라졌다");
  assert.equal(rows[0].shift_id, null, "휴무는 조가 없다");
  assert.equal(rows[0].memo, null);
});

test("★ 배정은 매장+직원+날짜로 같은 줄을 찾는다 (id 가 없다)", () => {
  assert.equal(CONFLICT_KEY.shift_assignments, "store_id,staff_id,business_date");
  assert.equal(CONFLICT_KEY.shifts, "id");
});

test("★ 비우는 순서 — 배정이 직원·조보다 먼저다", () => {
  const order = [...REPLACE_DELETE_ORDER];
  assert.ok(
    order.indexOf("shift_assignments") < order.indexOf("staff"),
    "배정을 직원보다 나중에 비우면 외래키에 걸린다",
  );
  assert.ok(
    order.indexOf("shift_assignments") < order.indexOf("shifts"),
    "배정을 근무조보다 나중에 비우면 외래키에 걸린다",
  );
});
