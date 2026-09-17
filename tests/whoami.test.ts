/* ------------------------------------------------------------------ *
 * 누가 체크했는가.
 *
 * 공용 태블릿이라 세 사람이 같은 화면을 누른다. 지금까지는 **누가 눌렀는지 없이**
 * 날짜별로만 남아서, 콜드브루를 아무도 시작 안 했어도 아무도 못 되짚었다.
 * 체크는 돼 있는데 물건이 없으면 **다음부터 아무도 체크를 안 믿는다.**
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import { hhmm, mark, markKey, type MarkLog } from "../src/lib/whoami.ts";

test("mark: 켜면 누가·언제가 남는다", () => {
  const at = new Date(2026, 8, 12, 14, 32);
  const log = mark({}, "p-1", true, "김대리", at);
  assert.deepEqual(log, { "p-1": { who: "김대리", at: "14:32" } });
});

test("★ 끄면 지운다 — 껐는데 이름이 남으면 거짓말이 된다", () => {
  const at = new Date(2026, 8, 12, 14, 32);
  const on = mark({}, "p-1", true, "김대리", at);
  const off = mark(on, "p-1", false, "김대리", at);
  assert.deepEqual(off, {});
});

test("다른 사람이 다시 켜면 그 사람으로 바뀐다", () => {
  const a = mark({}, "p-1", true, "김대리", new Date(2026, 8, 12, 9, 5));
  const b = mark(a, "p-1", true, "박주임", new Date(2026, 8, 12, 14, 32));
  assert.deepEqual(b["p-1"], { who: "박주임", at: "14:32" });
});

test("이름을 안 골랐으면 빈 문자열로 남는다 (기록 자체는 남긴다)", () => {
  /* 이름이 없다고 기록을 안 남기면 «언제 눌렸는지» 도 같이 잃는다.
     시각만으로도 되짚을 거리가 된다. */
  const log = mark({}, "p-2", true, "", new Date(2026, 8, 12, 7, 40));
  assert.deepEqual(log["p-2"], { who: "", at: "07:40" });
});

test("한 건을 남겨도 다른 건은 안 건드린다", () => {
  const base: MarkLog = { "p-1": { who: "김대리", at: "09:00" } };
  const next = mark(base, "p-2", true, "박주임", new Date(2026, 8, 12, 10, 0));
  assert.deepEqual(next["p-1"], { who: "김대리", at: "09:00" });
  assert.equal(base["p-2"], undefined, "원본을 건드렸다");
});

test("★ 기록 키가 체크 상태 키와 다르다", () => {
  /* 체크는 영업일이 지나면 지워지지만 **기록은 남겨야** 되짚을 수 있다.
     같은 키에 얹으면 다음 날 아침에 어제 일을 못 본다. */
  const k = markKey("prep:afternoon", "2026-09-12");
  assert.equal(k, "sop:mark:prep:afternoon:2026-09-12");
  assert.ok(!k.startsWith("sop:prep:"), "체크 상태 키와 겹친다");
});

test("hhmm: 한 자리 시각도 두 자리로", () => {
  assert.equal(hhmm(new Date(2026, 8, 12, 7, 5)), "07:05");
  assert.equal(hhmm(new Date(2026, 8, 12, 23, 59)), "23:59");
});
