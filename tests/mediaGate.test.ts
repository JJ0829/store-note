import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/* ------------------------------------------------------------------ *
 * `/api/media` — **바꾸는 길에 매장 번호가 걸려 있다** (2026-09-17 신설)
 *
 * 왜 테스트로 못 박나
 *   2026-09-17 전까지 POST·PUT·DELETE 가 전부 무인증이었다. 아무나
 *   이 매장 보관함에 파일을 넣고 지울 수 있었고, **아무 오류도 안 났다.**
 *   촬영을 시작하는 순간(지금 0장) 직원 얼굴이 그 상태가 된다.
 *   이런 결함은 화면을 눌러봐도 안 보이므로 사람이 못 잡는다.
 *
 *   반대로 **GET 을 막아버리는 것도 사고다.** 사진 자리(`MediaSlot`)가
 *   공개 체크리스트(`/p/`)·교육 모드(`/t/`)에 붙어 있어서, 막으면 신입이
 *   카톡 링크로 여는 화면에서 사진·영상이 통째로 사라진다.
 *
 *   그래서 이 파일은 **양쪽을 다 지킨다** — 쓰기는 막혀 있어야 하고
 *   읽기는 열려 있어야 한다.
 * ------------------------------------------------------------------ */

const ROUTE = path.join(process.cwd(), "src", "app", "api", "media", "route.ts");
const src = fs.readFileSync(ROUTE, "utf-8");

/** `export async function NAME(...) { ... }` 의 본문만 잘라낸다 */
function bodyOf(name: string): string {
  const at = src.indexOf(`export async function ${name}(`);
  assert.ok(at >= 0, `${name} 핸들러를 못 찾았다`);
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  assert.fail(`${name} 본문이 안 닫힌다`);
}

test("★ 보관함을 바꾸는 길 셋에 전부 매장 번호가 걸려 있다", () => {
  for (const name of ["POST", "PUT", "DELETE"]) {
    const body = bodyOf(name);
    assert.match(
      body,
      /blocked\(req\)/,
      `${name} 에 blocked(req) 가 없다 — 아무나 보관함을 바꿀 수 있다`,
    );

    /* 게이트가 **맨 앞**이어야 한다. 파일을 읽거나 지운 뒤에 막으면
       이미 일이 벌어진 뒤다 (POST 는 같은 자리의 옛 파일을 먼저 지운다). */
    const gateAt = body.indexOf("blocked(req)");
    const firstAwait = body.indexOf("await ");
    if (firstAwait >= 0)
      assert.ok(
        gateAt < firstAwait,
        `${name} 이 게이트보다 먼저 무언가를 한다 — 막기 전에 이미 벌어진다`,
      );
  }
});

test("★ GET 은 막지 않는다 — 공개 체크리스트·교육 모드가 사진을 쓴다", () => {
  const body = bodyOf("GET");
  assert.doesNotMatch(
    body,
    /blocked\(/,
    "GET 에 게이트가 붙었다. 신입이 카톡 링크로 여는 화면에서 사진이 전부 사라진다",
  );
});

test("매장 번호가 설정 안 된 서버에서는 막지 않는다 (촬영이 통째로 막히면 안 된다)", () => {
  const at = src.indexOf("function blocked(");
  assert.ok(at >= 0, "blocked() 를 못 찾았다");
  const body = src.slice(at, at + 600);
  assert.match(
    body,
    /if \(!storePinConfigured\(\)\) return null/,
    "STORE_PIN 이 없을 때 통과시키는 줄이 없다 — api/shoot-plan 과 같은 규율이어야 한다",
  );
});

test("게이트는 api/shoot-plan 과 같은 쿠키·같은 검사기를 쓴다", () => {
  assert.match(
    src,
    /from "@\/lib\/serverGate"/,
    "serverGate 를 안 쓴다 — 매장 PIN 판정이 두 벌이 되면 한쪽만 고쳐진다",
  );
  for (const sym of ["STORE_COOKIE", "cookieMatches", "storePinConfigured"])
    assert.ok(src.includes(sym), `${sym} 을 안 쓴다`);
});

test("MediaSlot 이 공개 화면에 붙어 있다는 전제가 아직 사실이다", () => {
  /* 이 전제가 깨지면(공개 화면에서 MediaSlot 이 빠지면) GET 도 막을 수 있다.
     그때 이 테스트가 걸려서 위의 판단을 다시 보게 만든다. */
  const 공개화면 = [
    path.join(process.cwd(), "src", "components", "ChecklistView.tsx"),
    path.join(process.cwd(), "src", "components", "TrainingMode.tsx"),
  ];
  for (const f of 공개화면) {
    const s = fs.readFileSync(f, "utf-8");
    assert.match(
      s,
      /MediaSlot/,
      `${path.basename(f)} 에서 MediaSlot 이 빠졌다 — 이제 GET 도 막을 수 있는지 다시 볼 것`,
    );
  }
});
