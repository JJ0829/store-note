/* ------------------------------------------------------------------ *
 * 시연용 단일 파일이 깨지지 않았는가.
 *
 * ★ 왜 이 테스트가 생겼나 — 2026-09-09 에 이 파일을 두 번 깨뜨렸다.
 *   두 번째는 `const hhmm = ...` 을 추가했는데 **아래에 같은 이름의 함수가
 *   이미 있어서**(Date → "HH:MM" 문자열, 뜻이 정반대) `SyntaxError` 가 났다.
 *   화면이 통째로 빈 채로 열렸는데 콘솔에도 안 잡혔다.
 *
 *   이 파일은 **발표장에서 인터넷이 끊겼을 때의 마지막 수단**이다.
 *   깨진 걸 발표 당일에 알면 늦는다. `npm test` 에서 잡히게 한다.
 *
 * ⚠️ 여기서 하는 것은 **구문 검사와 몇 가지 계약 확인**뿐이다.
 *   화면이 제대로 그려지는지는 브라우저로 봐야 한다 (DOM 이 없다).
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["presentation/매장수첩.html", "presentation/app.html"] as const;

function scriptOf(path: string): string {
  const html = readFileSync(path, "utf8");
  const m = html.match(/<script>\n([\s\S]*?)<\/script>/);
  assert.ok(m, `${path}: <script> 블록을 못 찾았다`);
  return m[1];
}

for (const path of FILES) {
  test(`${path} — 자바스크립트 구문이 정상이다`, () => {
    const js = scriptOf(path);
    // 컴파일만 한다. 실행하면 document 가 없어서 죽는다
    assert.doesNotThrow(
      () => new vm.Script(js, { filename: path }),
      `${path} 의 스크립트가 깨졌다 — 파일을 열면 화면이 빈 채로 뜬다`,
    );
  });

  test(`${path} — 외부 요청이 0건이다 (오프라인 시연 전제)`, () => {
    const html = readFileSync(path, "utf8");
    const hits = html.match(/https?:\/\//g) ?? [];
    assert.deepEqual(hits, [], "외부 URL 이 생겼다 — 발표장에서 인터넷이 끊기면 깨진다");
  });
}

test("두 파일의 스크립트가 같다 (사본이 갈리면 한쪽만 고치게 된다)", () => {
  const [a, b] = FILES.map(scriptOf);
  assert.equal(a, b, "매장수첩.html 과 app.html 의 스크립트가 달라졌다");
});

test("★ 마감조가 자정을 넘는 설정으로 들어 있다", () => {
  const js = scriptOf(FILES[0]);
  assert.match(
    js,
    /name:"마감조",\s*start:"17:00",\s*end:"01:00"/,
    "단일 파일의 마감조 시각이 시드와 어긋났다",
  );
});

test("★ 자정 넘김을 다루는 onDuty 가 있다", () => {
  const js = scriptOf(FILES[0]);
  assert.match(js, /function onDuty\(/, "onDuty 가 사라졌다 — 마감조가 화면에서 안 뜬다");
  // 옛 판정이 되살아나면 마감조가 다시 안 잡힌다
  assert.doesNotMatch(
    js,
    /cur >= mins\(s\.start\) && cur < mins\(s\.end\)/,
    "옛 근무조 판정이 되살아났다",
  );
});

test("★ 영업일 경계(새벽 5시)가 들어 있다", () => {
  const js = scriptOf(FILES[0]);
  assert.match(js, /DAY_START_HOUR = 5/);
  assert.match(js, /function pruneDayKeys\(/);
});

test("마감조 문구에 시간 압박이 없다", () => {
  // "30분 안에 끝냅니다" 같은 문장은 일하는 사람에게 압박이다.
  // 이 제품이 내세우는 것은 속도가 아니라 누락 방지다
  const js = scriptOf(FILES[0]);
  const m = js.match(/slug:"cafe-close"[\s\S]{0,400}?summary:"([^"]*)"/);
  assert.ok(m, "마감조 summary 를 못 찾았다");
  assert.doesNotMatch(m[1], /분 안에 끝/, "마감조 문구에 시간 압박이 돌아왔다");
});
