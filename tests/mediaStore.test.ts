/* ------------------------------------------------------------------ *
 * 촬영 보관함의 이름 규칙.
 *
 * ★ 여기가 **경로를 못 벗어나게 막는 자리**다. `base` 는 화면이 보내는
 *   항목 id 인데, 그대로 믿고 이어붙이면 보관함 바깥을 건드린다.
 *   2026-09-13 에 보관함이 Supabase Storage 로 옮겨지면서 이 검사도
 *   같이 옮겨 왔다 — 저장소가 바뀌어도 **이름 규칙은 그대로여야 한다.**
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import {
  isStoredName,
  safeName,
  siblingNames,
  MAX_BYTES,
} from "../src/lib/mediaStore.ts";

test("자리마다 이름이 다르다", () => {
  assert.equal(safeName("t-open-5", "good", "jpg"), "t-open-5-good.jpg");
  assert.equal(safeName("t-open-5", "bad", "png"), "t-open-5-bad.png");
  // 영상만 `-slot` 이 안 붙는다 — 한 항목에 영상은 하나다
  assert.equal(safeName("t-open-5", "video", "mp4"), "t-open-5.mp4");
});

test("★ 경로를 벗어나려 하면 고치지 않고 거절한다", () => {
  /* 조용히 고쳐서 넣으면 `../../evil` 이 `evil` 로 바뀌어 저장되고,
     보관함에 아무도 모르는 파일이 쌓인다. **경로를 못 벗어나는 것**과
     **이상한 것을 안 받는 것**은 다른 일이다. */
  assert.equal(safeName("../../evil", "good", "jpg"), null);
  assert.equal(safeName("a/b", "good", "jpg"), null);
  assert.equal(safeName("t open 5", "good", "jpg"), null);
  assert.equal(safeName("t_open_5", "good", "jpg"), null);
  assert.equal(safeName("", "good", "jpg"), null);
});

test("사진 자리에 영상 확장자를 못 넣는다 (반대도)", () => {
  assert.equal(safeName("t-open-5", "good", "mp4"), null);
  assert.equal(safeName("t-open-5", "video", "jpg"), null);
});

test("실행 파일 같은 것은 아예 안 받는다", () => {
  for (const ext of ["exe", "sh", "js", "html", "svg"])
    assert.equal(safeName("t-open-5", "good", ext), null, `.${ext} 가 통과했다`);
});

test("폰이 내놓는 형식은 다 받는다", () => {
  for (const ext of ["jpg", "jpeg", "png", "webp", "heic"])
    assert.ok(safeName("p-1", "good", ext), `.${ext} 를 막았다`);
  for (const ext of ["mp4", "mov", "webm", "m4v"])
    assert.ok(safeName("p-1", "video", ext), `.${ext} 를 막았다`);
});

test("자리 이름이 셋 중 하나가 아니면 거절한다", () => {
  // @ts-expect-error — 화면 밖에서 들어오는 값을 흉내 낸다
  assert.equal(safeName("p-1", "goood", "jpg"), null);
});

test("★ 같은 자리의 옛 파일을 전부 짚는다 (두 장이 남지 않게)", () => {
  /* jpg 로 넣었다가 png 로 다시 찍으면 둘 다 남는다. 화면은 그중 하나만
     보여주므로 **지운 줄 알았던 것이 계속 보관함에 있다.** */
  const sib = siblingNames("t-open-5", "good");
  assert.ok(sib.includes("t-open-5-good.jpg"));
  assert.ok(sib.includes("t-open-5-good.png"));
  assert.ok(sib.includes("t-open-5-good.heic"));
  assert.ok(!sib.includes("t-open-5-bad.jpg"), "다른 자리까지 지우려 한다");
  assert.ok(!sib.includes("t-open-5.mp4"), "영상까지 지우려 한다");
});

test("영상 자리는 영상 확장자만 짚는다", () => {
  const sib = siblingNames("t-open-5", "video");
  assert.deepEqual(sib, ["t-open-5.mp4", "t-open-5.mov", "t-open-5.webm", "t-open-5.m4v"]);
});

test("지우기는 목록에서 받은 모양만 받는다", () => {
  assert.equal(isStoredName("t-open-5-good.jpg"), true);
  assert.equal(isStoredName("../../etc/passwd"), false);
  assert.equal(isStoredName("a/b.jpg"), false);
  assert.equal(isStoredName("noext"), false);
  assert.equal(isStoredName(""), false);
});

test("한도는 버킷과 같은 50MB 다", () => {
  /* 화면·서버·버킷 셋이 같은 값이어야 한다. 하나만 크면 올라가다 말고
     보관함이 거절하는데, 그때는 이미 통신이 다 끝난 뒤다 */
  assert.equal(MAX_BYTES, 52_428_800);
});

/* ------------------------------------------------------------------ *
 * ★ 주소에서 이름 뽑기 — 2026-09-13 에 실제로 걸린 자리
 * ------------------------------------------------------------------ */

test("★ 서명된 주소에서 토큰을 빼고 이름만 뽑는다", async () => {
  const { nameFromUrl } = await import("../src/lib/mediaProbe.ts");

  /* 보관함을 Supabase 로 옮기면서 주소가 서명된 것이 됐는데, 이름을
     `split("/").pop()` 으로 뽑고 있어서 `?token=...` 이 통째로 붙었다.
     서버는 그 이름을 거절하고 화면은 지운 줄 알고 넘어간다 —
     **누르면 아무 일도 안 일어나는데 아무도 모르는** 결함이었다. */
  assert.equal(
    nameFromUrl(
      "https://x.supabase.co/storage/v1/object/sign/media/t-open-5-good.png?token=eyJhbGciOiJI",
    ),
    "t-open-5-good.png",
  );
  // 폴더 갈래의 옛 주소도 그대로 된다
  assert.equal(nameFromUrl("/media/p-1.mp4"), "p-1.mp4");
  assert.equal(nameFromUrl(""), "");
});
