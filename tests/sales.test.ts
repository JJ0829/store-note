/* ------------------------------------------------------------------ *
 * 매출 · 손익.
 *
 * ★ 2026-09-12 부터 **고정비를 넣으면 진짜 순익이 된다.**
 *   안 넣었으면 `fixedMissing: true` 이고, 그때 `left` 는 재료비·인건비만
 *   뺀 값이다 — 화면이 그렇게 말해야 한다. 0 을 «고정비 없음» 으로 읽고
 *   그냥 «순익» 이라고 부르면 그 숫자로 가격을 정하는 사람이 손해를 본다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import {
  dailyFixed,
  emptyDay,
  getDay,
  profitOf,
  sumRange,
  type SalesData,
} from "../src/lib/sales.ts";
import { eul, eun, gwa, pct, ro, won } from "../src/lib/store.ts";

test("매출 − 재료비 − 인건비", () => {
  const p = profitOf({ date: "d", total: 1_000_000, count: 200, material: 280_000, note: "" }, 190_000);
  assert.equal(p.left, 530_000);
  assert.equal(p.perCustomer, 5000);
});

test("건수가 0이면 객단가는 null (0으로 나누지 않는다)", () => {
  assert.equal(profitOf({ date: "d", total: 100, count: 0, material: 0, note: "" }, 0).perCustomer, null);
});

test("인건비가 음수로 들어와도 0으로 본다", () => {
  const p = profitOf({ date: "d", total: 100_000, count: 1, material: 0, note: "" }, -50_000);
  assert.equal(p.labor, 0);
  assert.equal(p.left, 100_000);
});

test("적자면 음수가 그대로 나온다 (감추지 않는다)", () => {
  const p = profitOf({ date: "d", total: 300_000, count: 50, material: 200_000, note: "" }, 200_000);
  assert.equal(p.left, -100_000);
});

test("getDay: 없는 날은 빈 하루", () => {
  const data: SalesData = {};
  assert.deepEqual(getDay(data, "2026-09-04"), emptyDay("2026-09-04"));
});

test("sumRange: 기록이 없는 날은 건너뛴다", () => {
  const data: SalesData = {
    "2026-09-01": { date: "2026-09-01", total: 100, count: 2, material: 30, note: "" },
    "2026-09-03": { date: "2026-09-03", total: 200, count: 3, material: 40, note: "" },
  };
  const s = sumRange(data, ["2026-09-01", "2026-09-02", "2026-09-03"]);
  assert.equal(s.total, 300);
  assert.equal(s.count, 5);
  assert.equal(s.material, 70);
});

test("sumRange: 빈 기간이어도 0으로 돌려준다", () => {
  assert.equal(sumRange({}, []).total, 0);
});

/* ------------------------------------------------------------------ */
/* 표기                                                                 */
/* ------------------------------------------------------------------ */

test("won: 1원 미만은 버리고 자리를 나눈다", () => {
  assert.equal(won(504.0000001), "504");
  assert.equal(won(1_234_567), "1,234,567");
  assert.equal(won(NaN), "-");
});

test("pct: 0으로 나누면 '-'", () => {
  assert.equal(pct(504, 4500), "11.2");
  assert.equal(pct(1, 0), "-");
  assert.equal(pct(NaN, 100), "-");
});

/* ------------------------------------------------------------------ */
/* 한글 조사                                                            */
/*                                                                      */
/* 거래처 주문 방법이 전화·카톡·앱·홈페이지·방문으로 섞여 있어서        */
/* "${how}으로"라고 박아두면 절반이 틀린다. 실제로 화면에             */
/* "전화으로 보내세요"가 떴다.                                          */
/* ------------------------------------------------------------------ */

test("ro: 받침이 없으면 '로'", () => {
  assert.equal(ro("전화"), "전화로");
  assert.equal(ro("홈페이지"), "홈페이지로");
  assert.equal(ro("카카오"), "카카오로");
});

test("ro: 받침이 있으면 '으로'", () => {
  assert.equal(ro("카톡"), "카톡으로");
  assert.equal(ro("앱"), "앱으로");
  assert.equal(ro("방문"), "방문으로");
});

test("ro: 받침 ㄹ은 '로' (서울로, 이메일로)", () => {
  assert.equal(ro("서울"), "서울로");
  assert.equal(ro("이메일"), "이메일로");
});

test("ro: 한글이 아니면 '로'", () => {
  assert.equal(ro("DM"), "DM로");
  assert.equal(ro(""), "로");
});

test("eul / eun / gwa", () => {
  assert.equal(eul("원두"), "원두를");
  assert.equal(eul("우유팩"), "우유팩을");
  assert.equal(eun("김제빵"), "김제빵은");
  assert.equal(eun("이바리"), "이바리는");
  assert.equal(gwa("원두"), "원두와");
  assert.equal(gwa("설탕"), "설탕과");
});

test("조사 함수는 앞뒤 공백을 무시하고 판단한다", () => {
  // 거래처 이름 끝에 공백이 들어오는 일이 실제로 있다
  assert.equal(ro("전화 "), "전화 로");
  assert.equal(eul("설탕 "), "설탕 을");
});

/* ------------------------------------------------------------------ *
 * ★ 고정비 — 「순익」이 진짜 순익이 되는 조건 (2026-09-12)
 * ------------------------------------------------------------------ */

test("dailyFixed: 월 고정비를 영업일수로 나눈다", () => {
  assert.equal(dailyFixed(3_120_000, 26), 120_000);
  assert.equal(dailyFixed(3_000_000, 30), 100_000);
});

test("★ 고정비를 안 넣었으면 0 이고, 안 넣었다고 말한다", () => {
  /* 0 은 «고정비 없음» 이 아니라 «아직 안 넣음» 이다. 이걸 구분 안 하면
     화면이 재료비·인건비만 뺀 값을 조용히 «순익» 이라고 부른다 —
     그 숫자로 가격을 정하는 사람이 손해를 본다. */
  assert.equal(dailyFixed(0, 26), 0);
  const p = profitOf({ date: "2026-09-12", total: 500_000, count: 100, material: 150_000, note: "" }, 100_000);
  assert.equal(p.fixed, 0);
  assert.equal(p.fixedMissing, true, "안 넣은 것을 안 넣었다고 말해야 한다");
  assert.equal(p.left, 250_000, "고정비 전 값은 그대로");
});

test("고정비를 넣으면 그만큼 빠지고 하루 순익이 된다", () => {
  const fixed = dailyFixed(3_120_000, 26); // 120,000
  const p = profitOf(
    { date: "2026-09-12", total: 500_000, count: 100, material: 150_000, note: "" },
    100_000,
    fixed,
  );
  assert.equal(p.fixed, 120_000);
  assert.equal(p.fixedMissing, false);
  assert.equal(p.left, 130_000, "500,000 − 150,000 − 100,000 − 120,000");
});

test("고정비가 크면 순익이 음수가 된다 (숨기지 않는다)", () => {
  /* 적자를 0 으로 깎아 보여주면 «오늘은 본전» 으로 읽힌다. 사실대로 둔다 */
  const p = profitOf(
    { date: "2026-09-12", total: 200_000, count: 40, material: 80_000, note: "" },
    90_000,
    120_000,
  );
  assert.equal(p.left, -90_000);
});

test("영업일수가 0 이나 음수여도 안 죽는다", () => {
  assert.equal(dailyFixed(2_600_000, 0), 2_600_000);
  assert.equal(dailyFixed(2_600_000, -3), 2_600_000);
});
