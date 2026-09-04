/* ------------------------------------------------------------------ *
 * 근로계약서 점검.
 *
 * 여기서 놓치면 실제로 과태료·벌금이 나온다. 특히 서면 교부(제17조)는
 * "계약서를 썼다"가 아니라 "**직원에게 한 부 줬다**"가 기준이다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import { checkContract, keepUntil, type Contract } from "../src/lib/contracts.ts";

const MIN_WAGE = 10_320; // 2026년 적용액

function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: "ct1",
    staffId: "st1",
    startDate: "2026-01-02",
    endDate: "",
    hourlyWage: 11_000,
    weeklyHours: 20,
    workDays: [1, 2, 3, 4, 5],
    startTime: "09:00",
    endTime: "14:00",
    handedOver: true,
    insured: true,
    note: "",
    ...over,
  };
}

function titles(list: ReturnType<typeof checkContract>): string {
  return list.map((c) => c.title).join(" | ");
}

/* ------------------------------------------------------------------ */

test("서면 교부를 안 했으면 danger", () => {
  const out = checkContract(contract({ handedOver: false }), MIN_WAGE);
  const hit = out.find((c) => c.title.includes("서면 교부"));
  assert.ok(hit);
  assert.equal(hit.level, "danger");
  assert.match(hit.basis, /제17조/);
});

test("교부했으면 그 경고가 없다", () => {
  assert.doesNotMatch(titles(checkContract(contract(), MIN_WAGE)), /서면 교부/);
});

test("★ 최저임금 미달은 danger", () => {
  const out = checkContract(contract({ hourlyWage: 10_000 }), MIN_WAGE);
  const hit = out.find((c) => c.title.includes("최저임금"));
  assert.ok(hit);
  assert.equal(hit.level, "danger");
  assert.match(hit.title, /10,320/);
});

test("최저임금과 같으면 경고하지 않는다 (경계값)", () => {
  assert.doesNotMatch(
    titles(checkContract(contract({ hourlyWage: MIN_WAGE }), MIN_WAGE)),
    /최저임금/,
  );
});

test("시급을 아직 안 넣었으면 최저임금 경고를 띄우지 않는다", () => {
  // 0원을 미달로 보면 새 계약을 만들자마자 빨간 경고가 뜬다
  assert.doesNotMatch(
    titles(checkContract(contract({ hourlyWage: 0 }), MIN_WAGE)),
    /최저임금/,
  );
});

test("주 15시간이 주휴수당의 갈림길이다", () => {
  assert.match(titles(checkContract(contract({ weeklyHours: 15 }), MIN_WAGE)), /주휴수당이 발생/);
  assert.match(titles(checkContract(contract({ weeklyHours: 14 }), MIN_WAGE)), /주휴수당이 없습니다/);
});

test("계약 시작일이 비면 경고", () => {
  assert.match(titles(checkContract(contract({ startDate: "" }), MIN_WAGE)), /시작일/);
});

/* ------------------------------------------------------------------ */
/* 기간제                                                               */
/* ------------------------------------------------------------------ */

test("2년을 넘는 기간제는 무기계약 전환을 알려준다", () => {
  const out = checkContract(
    contract({ startDate: "2024-01-01", endDate: "2026-06-01" }),
    MIN_WAGE,
    new Date(2026, 0, 1),
  );
  assert.match(titles(out), /2년을 넘습니다/);
});

test("2년 이내면 그 경고가 없다", () => {
  const out = checkContract(
    contract({ startDate: "2026-01-01", endDate: "2027-01-01" }),
    MIN_WAGE,
    new Date(2026, 0, 1),
  );
  assert.doesNotMatch(titles(out), /2년을 넘습니다/);
});

test("만료 30일 안이면 알려준다", () => {
  const out = checkContract(
    contract({ startDate: "2026-01-01", endDate: "2026-09-20" }),
    MIN_WAGE,
    new Date(2026, 8, 4),
  );
  assert.match(titles(out), /16일 뒤 만료/);
});

test("만료가 멀면 조용하다", () => {
  const out = checkContract(
    contract({ startDate: "2026-01-01", endDate: "2026-12-31" }),
    MIN_WAGE,
    new Date(2026, 8, 4),
  );
  assert.doesNotMatch(titles(out), /만료/);
});

/* ------------------------------------------------------------------ */
/* 보존 기간 (제42조)                                                   */
/* ------------------------------------------------------------------ */

test("keepUntil: 계약 종료일 + 3년", () => {
  const d = keepUntil(contract({ endDate: "2026-12-31" }));
  assert.equal(d?.getFullYear(), 2029);
  assert.equal(d?.getMonth(), 11);
  assert.equal(d?.getDate(), 31);
});

test("keepUntil: 종료일이 없으면 시작일 기준", () => {
  assert.equal(keepUntil(contract({ startDate: "2026-01-02", endDate: "" }))?.getFullYear(), 2029);
});

test("keepUntil: 날짜가 없으면 null", () => {
  assert.equal(keepUntil(contract({ startDate: "", endDate: "" })), null);
});
