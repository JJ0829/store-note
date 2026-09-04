/* ------------------------------------------------------------------ *
 * 거래처 — 단가와 발주 타이밍.
 *
 * "금요일에 주말치까지 주문한다"가 왜 생기는지가 여기 들어 있다.
 * 일요일 배송을 하는 거래처가 거의 없어서다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import {
  arrivalOf,
  minutesToCutoff,
  unitPrice,
  findItemByName,
  type Vendor,
  type VendorItem,
} from "../src/lib/vendors.ts";

function vendor(over: Partial<Vendor> = {}): Vendor {
  return {
    id: "vd1",
    name: "○○유통",
    phone: "",
    contact: "",
    how: "전화",
    cutoff: "15:00",
    deliverDays: [1, 2, 3, 4, 5, 6], // 일요일 배송 없음
    leadDays: 1,
    note: "",
    ...over,
  };
}

function item(over: Partial<VendorItem> = {}): VendorItem {
  return {
    id: "vi1",
    vendorId: "vd1",
    name: "원두",
    packAmount: 1,
    packUnit: "kg",
    packPrice: 28_000,
    note: "",
    ...over,
  };
}

/* ------------------------------------------------------------------ */
/* 단가                                                                 */
/* ------------------------------------------------------------------ */

test("1kg 28,000원 → g당 28원", () => {
  assert.equal(unitPrice(item(), "g"), 28);
  assert.equal(unitPrice(item(), "kg"), 28_000);
});

test("계열이 다르면 null", () => {
  assert.equal(unitPrice(item(), "ml"), null);
  assert.equal(unitPrice(item(), "개"), null);
});

test("packAmount가 0이면 null (0으로 나누지 않는다)", () => {
  assert.equal(unitPrice(item({ packAmount: 0 }), "g"), null);
});

test("findItemByName: 공백만 무시한다", () => {
  const items = [item({ name: "우유" })];
  assert.ok(findItemByName(items, " 우유 "));
  assert.equal(findItemByName(items, "멸균우유"), null);
});

/* ------------------------------------------------------------------ */
/* 발주 타이밍                                                          */
/* ------------------------------------------------------------------ */

// 2026-09-04는 금요일
const FRI_AM = new Date(2026, 8, 4, 10, 0);
const FRI_PM = new Date(2026, 8, 4, 16, 0); // 마감(15:00) 이후

test("마감 전 금요일에 주문하면 토요일에 온다", () => {
  const d = arrivalOf(vendor(), FRI_AM);
  assert.equal(d.getDate(), 5);
  assert.equal(d.getDay(), 6); // 토
});

test("★ 마감을 넘기면 주문일이 하루 밀린다", () => {
  // 금요일 16시 주문 = 토요일 주문 → 리드 1일 = 일요일
  // 그런데 일요일 배송이 없으므로 월요일
  const d = arrivalOf(vendor(), FRI_PM);
  assert.equal(d.getDay(), 1); // 월
  assert.equal(d.getDate(), 7);
});

test("★ 배송 안 하는 요일은 건너뛴다", () => {
  // 토요일 주문, 리드 1일 → 일요일이지만 일요일 배송이 없다
  const SAT = new Date(2026, 8, 5, 10, 0);
  const d = arrivalOf(vendor(), SAT);
  assert.equal(d.getDay(), 1); // 월
});

test("주말 배송을 하는 거래처는 그대로 온다", () => {
  const SAT = new Date(2026, 8, 5, 10, 0);
  const d = arrivalOf(vendor({ deliverDays: [0, 1, 2, 3, 4, 5, 6] }), SAT);
  assert.equal(d.getDay(), 0); // 일
});

test("요일을 하나도 안 고르면 매일 온다고 본다", () => {
  const SAT = new Date(2026, 8, 5, 10, 0);
  const d = arrivalOf(vendor({ deliverDays: [] }), SAT);
  assert.equal(d.getDay(), 0);
});

test("당일 배송(leadDays 0)도 배송 요일을 지킨다", () => {
  const SUN = new Date(2026, 8, 6, 10, 0);
  const d = arrivalOf(vendor({ leadDays: 0 }), SUN);
  assert.equal(d.getDay(), 1); // 일요일 배송이 없으니 월요일
});

test("주 5일만 배송하는 곳에 금요일 마감 뒤 주문하면 월요일", () => {
  const d = arrivalOf(vendor({ deliverDays: [1, 2, 3, 4, 5] }), FRI_PM);
  assert.equal(d.getDay(), 1);
});

test("minutesToCutoff: 남은 시간, 지났으면 음수", () => {
  assert.equal(minutesToCutoff(vendor(), FRI_AM), 300); // 10:00 → 15:00
  assert.equal(minutesToCutoff(vendor(), FRI_PM), -60);
});
