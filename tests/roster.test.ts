/* ------------------------------------------------------------------ *
 * 근무표.
 *
 * 주 시작일이 하루라도 밀리면 근무표 전체가 하루씩 밀린다.
 * 그러면 사람이 안 나온다 — 화면 버그 중 가장 직접적으로 매장을 멈춘다.
 * 특히 일요일에 근무표를 짜는 경우(주말에 다음 주를 준비하는 게 보통이다)
 * "지난 월요일"로 거슬러 가야 하고, 그게 월말·연말이면 달·해가 바뀐다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEmailBody,
  bySection,
  label,
  loadRoster,
  mondayOf,
  saveRoster,
  weekDays,
  ymd,
  type RosterData,
} from "../src/lib/roster.ts";

/* ------------------------------------------------------------------ */
/* ymd / label                                                          */
/* ------------------------------------------------------------------ */

test("ymd: 한 자리 월·일을 0으로 채운다", () => {
  assert.equal(ymd(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(ymd(new Date(2026, 8, 4)), "2026-09-04");
  assert.equal(ymd(new Date(2026, 11, 31)), "2026-12-31");
});

test("label: 화면·메일에 쓰는 표기", () => {
  assert.equal(label(new Date(2026, 8, 4)), "9/4(금)");
  assert.equal(label(new Date(2026, 7, 31)), "8/31(월)");
});

/* ------------------------------------------------------------------ */
/* mondayOf — 일요일이 가장 틀리기 쉽다                                 */
/* ------------------------------------------------------------------ */

test("mondayOf: 월요일을 넣으면 자기 자신", () => {
  assert.equal(ymd(mondayOf(new Date(2026, 7, 31))), "2026-08-31");
});

test("mondayOf: 주중 아무 날이나 같은 월요일로 모인다", () => {
  for (const d of [1, 2, 3, 4, 5, 6]) {
    // 9/1(화) ~ 9/6(일) 전부 8/31(월) 주다
    assert.equal(
      ymd(mondayOf(new Date(2026, 8, d))),
      "2026-08-31",
      `9/${d} 실패`,
    );
  }
});

test("mondayOf: 일요일은 '지난 월요일'로 6일 거슬러 간다 (월말 넘김)", () => {
  // 9/6(일) → 8/31(월). 여기서 그냥 day-1을 하면 9/5(토)가 나온다
  assert.equal(ymd(mondayOf(new Date(2026, 8, 6))), "2026-08-31");
});

test("mondayOf: 연말을 거슬러도 맞다", () => {
  // 2027-01-03(일) → 2026-12-28(월)
  assert.equal(ymd(mondayOf(new Date(2027, 0, 3))), "2026-12-28");
});

test("mondayOf: 시각이 섞여 있어도 자정으로 맞춘다", () => {
  const m = mondayOf(new Date(2026, 8, 4, 23, 59, 59));
  assert.equal(m.getHours(), 0);
  assert.equal(m.getMinutes(), 0);
  assert.equal(ymd(m), "2026-08-31");
});

/* ------------------------------------------------------------------ */
/* weekDays                                                             */
/* ------------------------------------------------------------------ */

test("weekDays: 월요일부터 7일, 달이 바뀌어도 이어진다", () => {
  const days = weekDays(mondayOf(new Date(2026, 8, 4)));
  assert.equal(days.length, 7);
  assert.deepEqual(days.map(ymd), [
    "2026-08-31",
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
    "2026-09-04",
    "2026-09-05",
    "2026-09-06",
  ]);
});

test("weekDays: 해가 바뀌어도 이어진다", () => {
  const days = weekDays(mondayOf(new Date(2027, 0, 3)));
  assert.equal(ymd(days[0]), "2026-12-28");
  assert.equal(ymd(days[6]), "2027-01-03");
});

test("weekDays: 원본 월요일 객체를 건드리지 않는다", () => {
  const monday = mondayOf(new Date(2026, 8, 4));
  weekDays(monday);
  assert.equal(ymd(monday), "2026-08-31");
});

/* ------------------------------------------------------------------ */
/* bySection                                                            */
/* ------------------------------------------------------------------ */

const STAFF = [
  { id: "st-1", section: "제빵", name: "김민수", email: "a@x.com", phone: "010-1111-2222" },
  { id: "st-2", section: "바", name: "이서연", email: "b@x.com", phone: "010-3333-4444" },
  { id: "st-3", section: "제빵", name: "박지훈", email: "", phone: "" },
  { id: "st-4", section: "  ", name: "최하은", email: "", phone: "" },
];

test("bySection: 같은 섹션끼리 묶고 등장 순서를 지킨다", () => {
  const groups = bySection(STAFF);
  assert.deepEqual(
    groups.map(([k, v]) => [k, v.map((s) => s.name)]),
    [
      ["제빵", ["김민수", "박지훈"]],
      ["바", ["이서연"]],
      ["미지정", ["최하은"]],
    ],
  );
});

test("bySection: 빈 명단은 빈 배열", () => {
  assert.deepEqual(bySection([]), []);
});

/* ------------------------------------------------------------------ */
/* buildEmailBody — 명단 블록 + 근무 블록                               */
/* ------------------------------------------------------------------ */

const DATA: RosterData = {
  staff: STAFF,
  assign: {
    "st-1": {
      "2026-08-31": "제빵",
      "2026-09-01": "제빵",
      "2026-09-02": "", // 휴무
    },
    "st-2": { "2026-08-31": "오픈조" },
  },
};

const DAYS = weekDays(mondayOf(new Date(2026, 8, 4)));

test("buildEmailBody: 머리글에 매장 이름과 주간 범위가 들어간다", () => {
  const body = buildEmailBody("동네빵집", DAYS, DATA);
  assert.ok(body.startsWith("동네빵집 근무표\n"));
  assert.ok(body.includes("8/31(월) ~ 9/6(일)"));
});

test("buildEmailBody: 두 블록이 다 있다", () => {
  const body = buildEmailBody("동네빵집", DAYS, DATA);
  assert.ok(body.includes("[ 직원 명단 ]"));
  assert.ok(body.includes("[ 이번 주 근무 ]"));
  // 명단이 근무표보다 먼저 나온다
  assert.ok(body.indexOf("[ 직원 명단 ]") < body.indexOf("[ 이번 주 근무 ]"));
});

test("buildEmailBody: 명단에 전 직원이 한 줄씩 들어간다", () => {
  const body = buildEmailBody("동네빵집", DAYS, DATA);
  for (const s of STAFF) assert.ok(body.includes(s.name), `${s.name} 없음`);
});

/* 기본값이 "연락처 제외"인 것은 사고 방지 장치다.
   받는 사람을 숨은참조로 가려놓고 본문에 연락처를 실으면 가린 의미가 없다 —
   직원 A가 받은 메일에 직원 B의 전화번호가 다 보인다.
   실수로 기본값이 뒤집히면 전 직원 연락처가 유출되므로 테스트로 못박는다.
   → docs/deliverables/06_보안설계.md V-03 */
test("buildEmailBody: 기본값은 연락처를 넣지 않는다", () => {
  const body = buildEmailBody("동네빵집", DAYS, DATA);
  assert.ok(!body.includes("a@x.com"), "이메일이 기본으로 들어갔다");
  assert.ok(!body.includes("010-1111-2222"), "전화번호가 기본으로 들어갔다");
  assert.ok(body.includes("이름"), "명단 표 자체는 있어야 한다");
});

test("buildEmailBody: includeContacts를 켜면 연락처가 들어간다", () => {
  const body = buildEmailBody("동네빵집", DAYS, DATA, { includeContacts: true });
  assert.ok(body.includes("a@x.com"));
  assert.ok(body.includes("010-1111-2222"));
});

test("buildEmailBody: 연락처를 켰을 때 빈 칸은 '-'로 채운다", () => {
  const body = buildEmailBody("동네빵집", DAYS, DATA, { includeContacts: true });
  const line = body.split("\n").find((l) => l.includes("박지훈"));
  assert.ok(line, "박지훈 줄 없음");
  assert.ok(line.trimEnd().endsWith("-"), `빈 칸 처리 안 됨: ${line}`);
});

/* 근무표 본문은 연락처 설정과 무관하게 같아야 한다.
   설정을 끄면 근무 정보까지 빠지는 실수를 막는다. */
test("buildEmailBody: 연락처 설정이 근무표 부분을 바꾸지 않는다", () => {
  const off = buildEmailBody("동네빵집", DAYS, DATA);
  const on = buildEmailBody("동네빵집", DAYS, DATA, { includeContacts: true });
  const week = (b: string) => b.slice(b.indexOf("[ 이번 주 근무 ]"));
  assert.equal(week(off), week(on));
});

test("buildEmailBody: 배정이 없는 날은 '휴무'로 적는다", () => {
  const body = buildEmailBody("동네빵집", DAYS, DATA);
  assert.ok(body.includes("8/31(월) 제빵"));
  assert.ok(body.includes("9/1(화) 제빵"));
  assert.ok(body.includes("9/2(수) 휴무")); // 빈 문자열 = 휴무
  assert.ok(body.includes("9/6(일) 휴무")); // 아예 키가 없는 날
});

test("buildEmailBody: 한 주도 안 나오는 사람은 7일 전부 휴무", () => {
  const body = buildEmailBody("동네빵집", DAYS, DATA);
  const lines = body.split("\n");
  const at = lines.findIndex((l) => l.includes("- 최하은"));
  assert.notEqual(at, -1, "최하은 줄 없음");
  assert.equal(lines[at + 1].split("휴무").length - 1, 7);
});

test("buildEmailBody: 섹션이 비면 '미지정'으로 묶인다", () => {
  const body = buildEmailBody("동네빵집", DAYS, DATA);
  assert.ok(body.includes("● 제빵"));
  assert.ok(body.includes("● 바"));
  assert.ok(body.includes("● 미지정"));
});

test("buildEmailBody: 직원이 없어도 죽지 않는다", () => {
  const body = buildEmailBody("동네빵집", DAYS, { staff: [], assign: {} });
  assert.ok(body.includes("[ 직원 명단 ]"));
  assert.ok(body.includes("[ 이번 주 근무 ]"));
});

/* ------------------------------------------------------------------ */
/* loadRoster — 구버전 데이터 마이그레이션                              */
/*                                                                      */
/* localStorage 자체를 검증하는 게 아니다. 검증할 것은 딱 하나,          */
/* 예전 버전이 'role'로 저장해 둔 직원 정보를 버리지 않는가다.           */
/* 이게 깨지면 사장님이 이미 입력해 둔 명단이 어느 날 통째로 사라진다.  */
/* ------------------------------------------------------------------ */

function useFakeStorage(initial?: string, fail = false) {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set("sop:roster", initial);
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (fail) throw new Error("QuotaExceeded");
        store.set(k, v);
      },
    },
    configurable: true,
    writable: true,
  });
  return store;
}

function dropFakeStorage() {
  delete (globalThis as unknown as Record<string, unknown>).localStorage;
}

test("loadRoster: 저장된 게 없으면 빈 근무표", (t) => {
  t.after(dropFakeStorage);
  useFakeStorage();
  assert.deepEqual(loadRoster(), { staff: [], assign: {} });
});

test("loadRoster: 구버전 'role'을 'section'으로 살려낸다", (t) => {
  t.after(dropFakeStorage);
  useFakeStorage(
    JSON.stringify({
      staff: [{ id: "st-1", role: "제빵", name: "김민수" }],
      assign: { "st-1": { "2026-08-31": "제빵" } },
    }),
  );
  const r = loadRoster();
  assert.equal(r.staff[0].section, "제빵");
  assert.equal(r.staff[0].name, "김민수");
  assert.equal(r.staff[0].email, ""); // 없던 칸은 빈 문자열로 채운다
  assert.deepEqual(r.assign["st-1"], { "2026-08-31": "제빵" });
});

test("loadRoster: 새 'section'이 있으면 그쪽이 이긴다", (t) => {
  t.after(dropFakeStorage);
  useFakeStorage(
    JSON.stringify({ staff: [{ id: "st-1", section: "바", role: "제빵" }] }),
  );
  assert.equal(loadRoster().staff[0].section, "바");
});

test("loadRoster: 깨진 JSON이 들어 있어도 화면이 죽지 않는다", (t) => {
  t.after(dropFakeStorage);
  useFakeStorage("{이건 JSON이 아니다");
  assert.deepEqual(loadRoster(), { staff: [], assign: {} });
});

test("loadRoster: staff가 배열이 아니어도 죽지 않는다", (t) => {
  t.after(dropFakeStorage);
  useFakeStorage(JSON.stringify({ staff: "망가짐" }));
  assert.deepEqual(loadRoster().staff, []);
});

test("saveRoster: 저장에 실패하면 false를 돌려준다 (예외를 던지지 않는다)", (t) => {
  t.after(dropFakeStorage);
  useFakeStorage(undefined, true);
  assert.equal(saveRoster({ staff: [], assign: {} }), false);
});

test("saveRoster → loadRoster 왕복", (t) => {
  t.after(dropFakeStorage);
  useFakeStorage();
  const data: RosterData = {
    staff: [
      { id: "st-9", section: "홀", name: "정우성", email: "", phone: "010" },
    ],
    assign: { "st-9": { "2026-09-01": "마감조" } },
  };
  assert.equal(saveRoster(data), true);
  assert.deepEqual(loadRoster(), data);
});
