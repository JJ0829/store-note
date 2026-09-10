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
 *
 * 짝이 되는 파일 —
 *   `tests/twoApps.test.ts`    박아둔 데이터가 `seed.json` 과 같은 사실인가
 *   `tests/builtPages.test.ts` Next 빌드 산출물이 실제로 무엇을 내보내는가
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const FILES = ["presentation/매장수첩.html", "presentation/app.html"] as const;

function scriptOf(path: string): string {
  const html = readFileSync(path, "utf8");
  // \r?\n — git 은 LF 로 저장하지만 Windows 에서 체크아웃하면 CRLF 가 된다.
  // \n 만 보면 이 파일을 처음 만든 작업 폴더에서만 통과하고 새 체크아웃에서는 전부 깨진다.
  const m = html.match(/<script>\r?\n([\s\S]*?)<\/script>/);
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

test("★ 자정 넘김을 다루는 onDuty 가 있다", () => {
  // 평소에는 안 쓰이지만 01:00 퇴근 예외인 날에 필요하다.
  // 없으면 그날 근무조가 홈에서 통째로 사라진다
  const js = scriptOf(FILES[0]);
  assert.match(js, /function onDuty\(/, "onDuty 가 사라졌다 — 연장된 날 근무조가 안 뜬다");
  // 옛 판정이 되살아나면 마감조가 다시 안 잡힌다
  assert.doesNotMatch(
    js,
    /cur >= mins\(s\.start\) && cur < mins\(s\.end\)/,
    "옛 근무조 판정이 되살아났다",
  );
});

test("★ 영업일 경계(새벽 4시)가 들어 있다", () => {
  const js = scriptOf(FILES[0]);
  assert.match(js, /DAY_START_HOUR = 4/);
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

/* ------------------------------------------------------------------ *
 * ★ 체크 저장 키 — 2026-09-10 에 실제로 틀리고 있던 것.
 *
 * 키가 `${섹션제목}-${순번}` 이었다. 섹션 이름을 고치거나 항목을 중간에
 * 끼우면 체크가 조용히 다른 항목으로 옮겨간다. 화면은 아무 말도 안 한다 —
 * 시연 자산의 데이터가 아무 말 없이 틀리는 종류의 고장이다.
 * 원본 앱은 task.id 를 쓴다. 단일 파일도 그래야 한다.
 *
 * 뿌리는 키 계산이 아니라 데이터였다 — seed.json 을 복사해 넣으면서
 * steps[].id 와 sections[].id 가 통째로 빠져서 쓸 키가 없었다.
 * 데이터가 시드와 같은지는 `tests/twoApps.test.ts` 가 본다 — 이 파일은
 * **파일이 안 깨졌는가**만 본다.
 * ------------------------------------------------------------------ */

for (const path of FILES) {
  test(`★ ${path} — 체크리스트가 t.id 로 저장한다`, () => {
    const js = scriptOf(path);
    const from = js.indexOf("function renderChecklist(");
    assert.ok(from > 0, "renderChecklist 를 못 찾았다");
    const body = js.slice(from, js.indexOf("\nrender();", from));

    assert.ok(
      !/\$\{s(ec)?\.title\}-\$\{i\}/.test(body),
      "제목+순번 키가 돌아왔다 — 섹션 이름을 고치면 체크가 다른 항목으로 옮겨간다",
    );
    assert.match(body, /store\.set\(key, \[\.\.\.done\]\)/, "저장 호출이 사라졌다");
    assert.match(body, /done\.(has|add|delete)\(t\.id\)/, "체크 판정이 t.id 가 아니다");
  });
}
