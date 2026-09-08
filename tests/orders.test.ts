/* ------------------------------------------------------------------ *
 * 발주 체크.
 *
 * ★ 이 파일의 존재 이유는 `pendingFrom()` 하나다.
 *   종이 체크리스트는 "주문함"까지만 적는다. 그런데 사고는 대개
 *   **주문은 했는데 안 들어온 것을 아침에 모르는 데서** 난다.
 *   그게 이 제품이 종이를 이긴다고 내세우는 지점인데
 *   2026-09-08 까지 테스트가 0건이었다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_STATE,
  buildOrderText,
  pendingFrom,
  putState,
  stateOf,
  type OrderLog,
} from "../src/lib/orders.ts";

/* ---------- 상태 읽기 ---------- */

test("기록이 없는 날짜는 빈 상태", () => {
  assert.deepEqual(stateOf({}, "2026-09-08", "p-3"), {
    ordered: false,
    received: false,
    memo: "",
  });
});

test("그 날짜에 다른 항목만 있으면 빈 상태", () => {
  const log: OrderLog = {
    "2026-09-08": { "p-3": { ordered: true, received: false, memo: "우유 12팩" } },
  };
  assert.equal(stateOf(log, "2026-09-08", "p-9").ordered, false);
});

test("★ 돌려준 상태를 고쳐도 다음 호출이 오염되지 않는다", () => {
  // EMPTY_STATE 를 그대로 넘기면 여기서 기본값이 영구히 바뀐다.
  // 화면이 전 항목을 "주문함"으로 표시하게 되고, 사람은 원인을 못 찾는다.
  const first = stateOf({}, "2026-09-08", "p-3");
  first.ordered = true;
  first.memo = "오염";

  const second = stateOf({}, "2026-09-08", "p-3");
  assert.equal(second.ordered, false);
  assert.equal(second.memo, "");
  // 상수 자체도 멀쩡해야 한다
  assert.equal(EMPTY_STATE.ordered, false);
  assert.equal(EMPTY_STATE.memo, "");
});

/* ---------- 상태 쓰기 ---------- */

test("putState 는 원본을 건드리지 않는다", () => {
  const log: OrderLog = {};
  const next = putState(log, "2026-09-08", "p-3", { ordered: true });
  assert.deepEqual(log, {}, "원본이 바뀌었다");
  assert.equal(next["2026-09-08"]["p-3"].ordered, true);
});

test("부분 갱신 — memo 만 바꿔도 주문 여부가 유지된다", () => {
  let log: OrderLog = {};
  log = putState(log, "2026-09-08", "p-3", { ordered: true });
  log = putState(log, "2026-09-08", "p-3", { memo: "우유 12팩" });
  const st = stateOf(log, "2026-09-08", "p-3");
  assert.equal(st.ordered, true, "주문 여부가 지워졌다");
  assert.equal(st.memo, "우유 12팩");
});

test("같은 날 다른 항목을 지우지 않는다", () => {
  let log: OrderLog = {};
  log = putState(log, "2026-09-08", "p-3", { ordered: true });
  log = putState(log, "2026-09-08", "p-9", { ordered: true });
  assert.equal(stateOf(log, "2026-09-08", "p-3").ordered, true);
  assert.equal(stateOf(log, "2026-09-08", "p-9").ordered, true);
});

test("다른 날짜를 지우지 않는다", () => {
  let log: OrderLog = {};
  log = putState(log, "2026-09-07", "p-3", { ordered: true, received: true });
  log = putState(log, "2026-09-08", "p-3", { ordered: true });
  assert.equal(stateOf(log, "2026-09-07", "p-3").received, true);
  assert.equal(stateOf(log, "2026-09-08", "p-3").received, false);
});

test("들어옴까지 찍으면 두 칸이 다 켜진다", () => {
  let log: OrderLog = {};
  log = putState(log, "2026-09-08", "p-3", { ordered: true });
  log = putState(log, "2026-09-08", "p-3", { received: true });
  const st = stateOf(log, "2026-09-08", "p-3");
  assert.equal(st.ordered, true);
  assert.equal(st.received, true);
});

/* ---------- ★ 안 들어온 것 찾기 — 이 파일의 핵심 ---------- */

function log3(): OrderLog {
  return {
    "2026-09-07": {
      "p-3": { ordered: true, received: false, memo: "우유 12팩" }, // 안 들어옴
      "p-4": { ordered: true, received: true, memo: "생지 2박스" }, // 들어옴
      "p-5": { ordered: false, received: false, memo: "" }, // 주문 안 함
    },
    "2026-09-08": {
      "p-3": { ordered: true, received: false, memo: "우유 6팩" }, // 안 들어옴
    },
  };
}

test("★ 주문했는데 안 들어온 것만 골라낸다", () => {
  const out = pendingFrom(log3(), ["2026-09-07", "2026-09-08"]);
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((x) => `${x.date}/${x.taskId}`),
    ["2026-09-07/p-3", "2026-09-08/p-3"],
  );
});

test("들어온 것은 안 나온다", () => {
  const out = pendingFrom(log3(), ["2026-09-07"]);
  assert.ok(!out.some((x) => x.taskId === "p-4"), "받은 항목이 섞여 나왔다");
});

test("주문도 안 한 것은 안 나온다", () => {
  const out = pendingFrom(log3(), ["2026-09-07"]);
  assert.ok(!out.some((x) => x.taskId === "p-5"));
});

test("★ 수량 메모를 같이 돌려준다 — 화면이 '우유 12팩'을 보여줘야 한다", () => {
  const out = pendingFrom(log3(), ["2026-09-07"]);
  assert.equal(out[0].memo, "우유 12팩");
});

test("기록이 없는 날짜는 건너뛴다 (지난 7일을 통째로 넘긴다)", () => {
  const out = pendingFrom(log3(), [
    "2026-09-01",
    "2026-09-02",
    "2026-09-07",
    "2026-09-99",
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].date, "2026-09-07");
});

test("넘긴 날짜 순서를 그대로 지킨다 (화면 정렬을 여기에 맡긴다)", () => {
  const out = pendingFrom(log3(), ["2026-09-08", "2026-09-07"]);
  assert.deepEqual(
    out.map((x) => x.date),
    ["2026-09-08", "2026-09-07"],
  );
});

test("빈 로그·빈 날짜 목록이어도 죽지 않는다", () => {
  assert.deepEqual(pendingFrom({}, []), []);
  assert.deepEqual(pendingFrom({}, ["2026-09-08"]), []);
  assert.deepEqual(pendingFrom(log3(), []), []);
});

/* ---------- 주문 문구 ---------- */

test("주문 문구에 매장명·거래처명·항목이 들어간다", () => {
  const t = buildOrderText("○○ 베이커리 카페", "우유상회", [
    { name: "우유", memo: "12팩" },
    { name: "생지", memo: "2박스" },
  ]);
  assert.ok(t.startsWith("[○○ 베이커리 카페] 발주 요청"));
  assert.ok(t.includes("우유상회 담당자님"));
  assert.ok(t.includes("- 우유 : 12팩"));
  assert.ok(t.includes("- 생지 : 2박스"));
});

test("거래처명이 비면 그 줄을 아예 넣지 않는다", () => {
  const t = buildOrderText("○○ 카페", "", [{ name: "우유", memo: "12팩" }]);
  assert.ok(!t.includes("담당자님"), "빈 이름으로 담당자님 줄이 나갔다");
  assert.ok(t.includes("- 우유 : 12팩"));
});

test("수량 메모가 없으면 콜론을 붙이지 않는다", () => {
  const t = buildOrderText("○○ 카페", "우유상회", [{ name: "우유", memo: "" }]);
  assert.ok(t.includes("- 우유\n"), "빈 메모에 콜론이 붙었다");
  assert.ok(!t.includes("- 우유 :"));
});

test("항목이 하나도 없어도 문구가 깨지지 않는다", () => {
  const t = buildOrderText("○○ 카페", "우유상회", []);
  assert.ok(t.includes("발주 요청"));
  assert.ok(t.includes("확인 후 회신"));
});
