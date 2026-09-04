/* ------------------------------------------------------------------ *
 * 사진·영상 붙이기.
 *
 * 데이터에 경로를 안 적고 파일 이름 규칙으로 찾는 구조라, 규칙이 틀리면
 * 사장님이 찍어 온 사진이 화면에 안 붙는다. 그런데 화면은 아무 말도 안 한다 —
 * 그냥 빈 칸이다. 사람이 눈치채기 가장 어려운 종류의 고장이다.
 *
 * `/api/media` 응답만 가짜로 넣어주면 나머지는 순수 계산이라 그대로 검사된다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import {
  expectedNames,
  forget,
  hasAny,
  probe,
  probeAll,
} from "../src/lib/mediaProbe.ts";

/** `/api/media`가 이 파일 목록을 돌려준 것처럼 만든다. 호출 횟수도 센다. */
function serve(files: string[], ok = true) {
  const state = { calls: 0 };
  const fake = async () => {
    state.calls += 1;
    return { ok, json: async () => ({ files }) };
  };
  (globalThis as unknown as { fetch: unknown }).fetch = fake;
  forget(); // 모듈 레벨 캐시를 비운다
  return state;
}

test("expectedNames: 촬영 화면에 보여주는 파일 이름", () => {
  assert.deepEqual(expectedNames("p-1"), {
    good: "p-1-good.jpg",
    bad: "p-1-bad.jpg",
    video: "p-1.mp4",
  });
});

test("확장자 우선순위: 같은 이름이 여럿이면 jpg가 먼저", () => {
  serve(["p-1-good.webp", "p-1-good.png", "p-1-good.jpg"]);
  return probe("p-1").then((f) => {
    assert.equal(f.good, "/media/p-1-good.jpg");
  });
});

test("jpg가 없으면 jpeg → png → webp 순서로 내려간다", async () => {
  serve(["p-1-good.webp", "p-1-good.png"]);
  assert.equal((await probe("p-1")).good, "/media/p-1-good.png");

  serve(["p-1-good.webp"]);
  assert.equal((await probe("p-1")).good, "/media/p-1-good.webp");

  serve(["p-1-good.jpeg", "p-1-good.png"]);
  assert.equal((await probe("p-1")).good, "/media/p-1-good.jpeg");
});

test("좋은 예 / 나쁜 예를 섞지 않는다", async () => {
  serve(["p-1-good.jpg", "p-1-bad.png"]);
  const f = await probe("p-1");
  assert.equal(f.good, "/media/p-1-good.jpg");
  assert.equal(f.bad, "/media/p-1-bad.png");
});

test("나쁜 예만 있어도 좋은 예로 잘못 잡히지 않는다", async () => {
  serve(["p-1-bad.jpg"]);
  const f = await probe("p-1");
  assert.equal(f.good, undefined);
  assert.equal(f.bad, "/media/p-1-bad.jpg");
});

test("영상은 mp4 → mov → webm 순서", async () => {
  serve(["p-1.webm", "p-1.mov", "p-1.mp4"]);
  assert.equal((await probe("p-1")).video, "/media/p-1.mp4");

  serve(["p-1.webm", "p-1.mov"]);
  assert.equal((await probe("p-1")).video, "/media/p-1.mov");
});

test("사진 파일이 영상 자리에 들어가지 않는다", async () => {
  serve(["p-1-good.jpg"]);
  const f = await probe("p-1");
  assert.equal(f.video, undefined);
});

test("이름이 앞부분만 같은 다른 항목에는 안 붙는다", async () => {
  // p-1과 p-10은 다른 업무다. 접두사 매칭이면 여기서 섞인다
  serve(["p-10-good.jpg", "p-10.mp4"]);
  const f = await probe("p-1");
  assert.equal(f.good, undefined);
  assert.equal(f.video, undefined);
  assert.equal(hasAny(f), false);
});

test("대소문자가 다르면 못 찾는다 (파일명 규칙은 소문자)", async () => {
  serve(["P-1-GOOD.JPG"]);
  assert.equal((await probe("p-1")).good, undefined);
});

test("hasAny: 하나라도 있으면 true", () => {
  assert.equal(hasAny(null), false);
  assert.equal(hasAny({}), false);
  assert.equal(hasAny({ good: "/media/a.jpg" }), true);
  assert.equal(hasAny({ video: "/media/a.mp4" }), true);
});

test("폴더 목록은 한 번만 받아온다 (요청 500개 사고 방지)", async () => {
  const state = serve(["p-1-good.jpg", "p-2-good.jpg"]);
  await probe("p-1");
  await probe("p-2");
  await probeAll(["p-1", "p-2", "p-3"]);
  assert.equal(state.calls, 1);
});

test("forget() 뒤에는 다시 받아온다 (촬영 직후 갱신)", async () => {
  const state = serve(["p-1-good.jpg"]);
  await probe("p-1");
  assert.equal(state.calls, 1);
  forget();
  await probe("p-1");
  assert.equal(state.calls, 2);
});

test("probeAll: 요청한 항목 수만큼 돌려준다", async () => {
  serve(["p-1-good.jpg", "p-2.mp4"]);
  const all = await probeAll(["p-1", "p-2", "p-3"]);
  assert.equal(all.size, 3);
  assert.equal(all.get("p-1")?.good, "/media/p-1-good.jpg");
  assert.equal(all.get("p-2")?.video, "/media/p-2.mp4");
  assert.equal(hasAny(all.get("p-3") ?? null), false);
});

test("API가 실패해도 화면이 죽지 않는다", async () => {
  serve([], false); // ok: false
  const f = await probe("p-1");
  assert.deepEqual(f, { good: undefined, bad: undefined, video: undefined });
});

test("네트워크가 끊겨도 화면이 죽지 않는다", async () => {
  (globalThis as unknown as { fetch: unknown }).fetch = async () => {
    throw new Error("offline");
  };
  forget();
  const f = await probe("p-1");
  assert.equal(hasAny(f), false);
});
