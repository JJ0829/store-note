/* ------------------------------------------------------------------ *
 * 촬영 목록 만들기 — 모델 응답을 그대로 믿지 않는다
 *
 * ★ 이 파일이 막는 사고: **반쯤 맞는 목록이 화면에 올라가는 것.**
 *   모델은 코드펜스를 붙이거나, 앞뒤에 말을 덧붙이거나, 필드를 빼먹거나,
 *   타입을 다르게 준다. 그걸 그대로 화면에 올리면 사장님이 그걸 믿는다.
 *
 *   AI 기능에서 제일 위험한 곳은 프롬프트가 아니라 **응답을 받는 자리**다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import { parseItems } from "../src/lib/shootPlan.ts";

const one = '{"items":[{"title":"추출 테스트","why":"기준이 갈린다","first":true}]}';

test("제대로 된 JSON 을 읽는다", () => {
  assert.deepEqual(parseItems(one), [
    { title: "추출 테스트", why: "기준이 갈린다", first: true },
  ]);
});

test("★ 코드펜스를 붙여 와도 읽는다", () => {
  const withFence = "```json\n" + one + "\n```";
  assert.equal(parseItems(withFence).length, 1);
});

test("★ 앞뒤에 말을 덧붙여 와도 읽는다", () => {
  const chatty = `네, 아래와 같이 정리했습니다.\n${one}\n도움이 되셨길 바랍니다.`;
  assert.equal(parseItems(chatty).length, 1);
});

test("JSON 이 아니면 빈 배열 — 화면이 '만들지 못했습니다' 를 띄운다", () => {
  assert.deepEqual(parseItems("죄송합니다, 잘 모르겠습니다."), []);
  assert.deepEqual(parseItems(""), []);
  assert.deepEqual(parseItems("{망가진"), []);
});

test("items 가 배열이 아니면 버린다", () => {
  assert.deepEqual(parseItems('{"items":"추출 테스트"}'), []);
  assert.deepEqual(parseItems('{"items":null}'), []);
  assert.deepEqual(parseItems('{"foo":[]}'), []);
});

test("★★ 제목이 없는 항목은 통째로 버린다 — 반쯤 맞는 것을 올리지 않는다", () => {
  const mixed =
    '{"items":[{"why":"제목이 없다"},{"title":"","why":"빈 제목"},' +
    '{"title":"스팀 밀크","why":"거품 상태"}]}';
  assert.deepEqual(parseItems(mixed), [
    { title: "스팀 밀크", why: "거품 상태", first: false },
  ]);
});

test("why 가 없어도 제목이 있으면 살린다 (빈 문자열로)", () => {
  assert.deepEqual(parseItems('{"items":[{"title":"발효 판단"}]}'), [
    { title: "발효 판단", why: "", first: false },
  ]);
});

test("★ first 는 true 일 때만 true — 'true' 문자열이나 1 에 속지 않는다", () => {
  const r = parseItems(
    '{"items":[{"title":"a","first":"true"},{"title":"b","first":1},{"title":"c","first":true}]}',
  );
  assert.deepEqual(
    r.map((x) => x.first),
    [false, false, true],
  );
});

test("★ 항목이 너무 많으면 자른다 — 화면과 비용을 지킨다", () => {
  const many = JSON.stringify({
    items: Array.from({ length: 60 }, (_, i) => ({ title: `t${i}`, why: "w" })),
  });
  assert.equal(parseItems(many).length, 24);
});

test("★ 긴 제목·설명을 자른다 — 화면이 무너지지 않게", () => {
  const long = JSON.stringify({
    items: [{ title: "가".repeat(300), why: "나".repeat(500) }],
  });
  const [it] = parseItems(long);
  assert.equal(it.title.length, 80);
  assert.equal(it.why.length, 200);
});

test("객체가 아닌 항목이 섞여 있어도 나머지는 산다", () => {
  const r = parseItems('{"items":[null,"문자열",42,{"title":"살아남는다"}]}');
  assert.deepEqual(
    r.map((x) => x.title),
    ["살아남는다"],
  );
});
