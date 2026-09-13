/* ------------------------------------------------------------------ *
 * 지표 이벤트.
 *
 * **여기서 못 박는 것은 딱 하나다 — `sessionId`가 빠지지 않는 것.**
 *
 * 이번에 실제로 깨져 있던 게 그것이다. `log()` 함수가 컴포넌트 4개에
 * 복사돼 있었고 **교육 모드만 `sessionId`를 안 붙였다.** 그래서
 * `교육_완료`(몇 분 걸렸나)와 `설문_응답`(몇 번 물었나)를 이을
 * 열쇠가 없었다 — 검증하려는 가설이 정확히 그 둘을 붙여 보는 것인데도.
 * → `01_MVP기획서` §8.4 #3
 *
 * 그리고 그건 **아무 오류도 안 내는 종류의 결함**이다. 이벤트는 잘 쌓이고
 * 화면도 정상이고, 나중에 분석하려 할 때야 못 잇는다는 걸 안다.
 * 그때는 데이터를 다시 모을 수 없다.
 *
 * 그래서 함수를 한 곳에 모으고(`src/lib/metrics.ts`) 여기서 검사한다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------ */
/* 복사본이 다시 생기지 않게                                            */
/* ------------------------------------------------------------------ */

/**
 * ★ 이 테스트가 이 파일에서 가장 중요하다.
 *
 * 컴포넌트가 자기만의 `log()`를 다시 만들면 `sessionId`를 또 빼먹을 수 있다.
 * 그래서 **컴포넌트 안에 `/api/log`를 직접 부르는 코드가 없어야** 한다.
 */
test("★ 컴포넌트가 /api/log를 직접 부르지 않는다 (metrics.ts만 부른다)", () => {
  const dir = path.join(process.cwd(), "src", "components");
  const offenders: string[] = [];

  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".tsx")) continue;
    const src = fs.readFileSync(path.join(dir, name), "utf-8");
    // 주석에 적힌 경로는 세지 않는다 — fetch 호출만 본다
    if (/fetch\(\s*["']\/api\/log["']/.test(src)) offenders.push(name);
  }

  assert.deepEqual(
    offenders,
    [],
    `컴포넌트가 직접 /api/log를 부른다: ${offenders.join(", ")}. ` +
      "`logEvent`(src/lib/metrics.ts)를 쓸 것 — 직접 부르면 sessionId를 빼먹는다.",
  );
});

test("★ metrics.ts가 sessionId를 본문에 넣는다", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src", "lib", "metrics.ts"),
    "utf-8",
  );
  assert.match(
    src,
    /body:\s*JSON\.stringify\(\{\s*event,\s*sessionId:\s*getSessionId\(\)/,
    "logEvent의 본문에서 sessionId가 빠졌다 — 이벤트를 서로 이을 수 없게 된다",
  );
});

test("이벤트를 보내는 컴포넌트는 모두 metrics.ts를 쓴다", () => {
  const dir = path.join(process.cwd(), "src", "components");
  const bad: string[] = [];

  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".tsx")) continue;
    const src = fs.readFileSync(path.join(dir, name), "utf-8");
    const sends = /\blog(Event)?\(\s*["'][a-z_가-힣]+["']/.test(src);
    const imports = /from\s+["']@\/lib\/metrics["']/.test(src);
    if (sends && !imports) bad.push(name);
  }

  assert.deepEqual(bad, [], `이벤트를 보내는데 metrics를 안 쓴다: ${bad.join(", ")}`);
});

/* ------------------------------------------------------------------ */
/* 어떤 이벤트가 있는가 — 문서와 어긋나지 않게                          */
/* ------------------------------------------------------------------ */

/**
 * 코드가 실제로 쏘는 이벤트 이름을 긁어온다.
 *
 * 왜 필요한가 — `CLAUDE.md`의 지표 표가 **5종으로 적혀 있는데 코드는 10종을
 * 쏘고 있었다.** 프렙·레시피 5종이 빠져 있었고 아무도 몰랐다.
 * 문서를 손으로 맞추면 또 어긋난다. → `20_기능흐름도`
 */
function eventNames(): string[] {
  const dir = path.join(process.cwd(), "src", "components");
  const found = new Set<string>();
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".tsx")) continue;
    const src = fs.readFileSync(path.join(dir, name), "utf-8");
    for (const m of src.matchAll(/\blog(?:Event)?\(\s*["']([a-z_가-힣]+)["']/g)) {
      found.add(m[1]);
    }
  }
  return [...found].sort();
}

/**
 * 코드가 쏘는 이벤트 목록. **여기를 고치면 문서도 고쳐야 한다.**
 *
 * 이벤트를 늘리거나 이름을 바꾸면 이 테스트가 걸린다. 그때
 * `CLAUDE.md`의 지표 표와 `20_기능흐름도`을 같이 갱신할 것.
 */
const EXPECTED = [
  // 교육·체크 — 가설 검증의 본체
  "체크리스트_열기",
  "교육_시작",
  "필수항목_확인",
  "교육_완료",
  "설문_응답",
  "체크", // 2026-09-10 신설. 체크리스트에 체크 이벤트가 없었다
  // 매일 열리는 화면 — "정말 매일 여는가"
  "프렙_열기",
  "프렙_체크",
  "프렙_배수",
  "레시피_열기",
  "레시피_배수",
  // ★ 버튼이 둘이면 이름도 둘이다 (2026-09-13)
  "출근", // 전에는 punch + which:"in"
  "퇴근", // 전에는 punch + which:"out"
  "발주_주문함", // 전에는 order_mark + step:"ordered"
  "발주_들어옴", // 전에는 order_mark + step:"received"
  "매출_입력", // 전에는 sales_close
  "백업_내려받기", // 전에는 backup
].sort();

test("★ 이벤트 목록이 문서와 맞는지 — 늘리면 이 테스트가 걸린다", () => {
  const actual = eventNames();
  const added = actual.filter((e) => !EXPECTED.includes(e));
  const removed = EXPECTED.filter((e) => !actual.includes(e));

  assert.deepEqual(
    { added, removed },
    { added: [], removed: [] },
    "이벤트가 바뀌었다. tests/metrics.test.ts의 EXPECTED와 " +
      "CLAUDE.md 지표 표, 20_기능흐름도를 같이 고칠 것.",
  );
});

test("이벤트 17종 — 매출·출퇴근·발주·백업이 들어 있다", () => {
  const actual = eventNames();
  assert.equal(actual.length, 17);
  // B4 확인 순서 2번("입력이 실제로 채워지는가")을 답할 수 있는 것들
  for (const e of [
    "출근",
    "퇴근",
    "매출_입력",
    "발주_주문함",
    "발주_들어옴",
    "백업_내려받기",
  ]) {
    assert.ok(actual.includes(e), `${e}가 없다`);
  }
});

/**
 * ★ 이름이 화면의 버튼과 같은 말이어야 한다 (2026-09-13).
 *
 * 전에는 표에 `punch` / `which: "out"` 이 뜨는데 화면 버튼은 「퇴근」이었다.
 * 기록을 읽는 사람이 매번 코드를 뒤져야 하면, 실제로 쓸 때 헷갈리고
 * 결국 아무도 표를 안 본다. **옛 이름이 되살아나면 여기서 걸린다.**
 */
test("★ 옛 영어 이름이 되살아나지 않는다", () => {
  const 옛이름 = [
    "view",
    "check",
    "training_start",
    "critical_confirm",
    "training_complete",
    "survey",
    "prep_view",
    "prep_check",
    "prep_scale",
    "recipe_view",
    "recipe_scale",
    "punch",
    "sales_close",
    "order_mark",
    "backup",
  ];
  const actual = eventNames();
  const 되살아남 = 옛이름.filter((e) => actual.includes(e));
  assert.deepEqual(
    되살아남,
    [],
    "옛 이름이 다시 들어왔다 — 이벤트 이름은 화면 버튼과 같은 말로 적는다",
  );
});

/* ------------------------------------------------------------------ */
/* 이벤트에 담기면 안 되는 것                                           */
/* ------------------------------------------------------------------ */

/**
 * ★ 지표에 개인정보·영업정보를 담지 않는다.
 *
 * 이벤트는 서버 파일(나중엔 DB)에 그대로 쌓인다. 직원 이름이나 매출액이
 * 거기 들어가면 지표 파일이 개인정보·영업비밀 파일이 된다.
 * `10_개인정보처리방침`의 수집 항목 표가 그만큼 늘어난다.
 *
 * 그래서 **"채워졌는가"만 남기고 "무엇이 채워졌는가"는 남기지 않는다.**
 */
test("★ 새 이벤트가 이름·금액을 담지 않는다", () => {
  const checks: Array<[string, RegExp]> = [
    // 출퇴근: 누가·몇 시에 찍었는지 남기지 않는다. 이름이 곧 출근/퇴근이라
    // 담는 값이 아예 없다 (2026-09-13)
    ["AttendanceView.tsx", /logEvent\("출근"\);\s*else logEvent\("퇴근"\);/],
    // 매출: 날짜와 칸 이름만. 금액 없음
    ["SalesView.tsx", /logEvent\("매출_입력",\s*\{\s*date,\s*field:\s*f\s*\}\)/],
  ];

  for (const [file, re] of checks) {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src", "components", file),
      "utf-8",
    );
    assert.match(src, re, `${file}의 이벤트 페이로드가 바뀌었다 — 개인정보·금액이 섞이지 않았는지 확인할 것`);
  }
});

test("출퇴근 이벤트에 이름·시각 필드가 없다", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "AttendanceView.tsx"),
    "utf-8",
  );
  const m = src.match(/logEvent\("출근"\)[\s\S]{0,60}logEvent\("퇴근"\)/);
  assert.ok(m, "출근·퇴근 이벤트를 못 찾았다");
  assert.ok(!/staffId|name|inAt|outAt/.test(m[0]), `이름·시각이 섞였다: ${m[0]}`);
});

test("매출 이벤트에 금액 필드가 없다", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "SalesView.tsx"),
    "utf-8",
  );
  const m = src.match(/logEvent\("매출_입력",[^)]*\)/);
  assert.ok(m, "매출_입력 이벤트를 못 찾았다");
  assert.ok(!/total:|material:|count:|won/.test(m[0]), `금액이 섞였다: ${m[0]}`);
});

/* ------------------------------------------------------------------ */
/* 폭주 방지 — onChange에 매달린 이벤트                                 */
/* ------------------------------------------------------------------ */

/**
 * ★ `onChange`로 불리는 함수 안에서 이벤트를 남기면 글자마다 쌓인다.
 *
 * 매출의 `patch()`와 발주의 `patch()`가 둘 다 `onChange`에 매달려 있다.
 * "1250000"을 입력하면 7건이 쌓인다 — 브라우저에서 실제로 확인하고 고쳤다.
 * 그래서 **0이었다가 값이 들어오는 전이**만 남긴다.
 */
test("★ 매출 이벤트는 전이(0 → 값)만 남긴다", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "SalesView.tsx"),
    "utf-8",
  );
  assert.match(
    src,
    /if\s*\(!\(cur\[f\]\s*>\s*0\)\s*&&\s*merged\[f\]\s*>\s*0\)/,
    "전이 검사가 사라졌다 — onChange라서 글자마다 이벤트가 쌓인다",
  );
});

/**
 * ★ 발주는 값이 아니라 전이를 봐야 한다.
 *
 * `들어옴`을 누르면 `ordered`도 파생으로 켠다(들어왔으면 주문한 것이다).
 * 그래서 값만 보면 **이미 켜진 `ordered`를 또 남긴다.** 브라우저 테스트에서
 * 주문함 1번 + 들어옴 1번에 `ordered`가 2건 찍혀서 발견했다.
 */
test("★ 발주 이벤트는 이전 상태와 비교한다 (파생 켜짐을 중복 안 셈)", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "OrderView.tsx"),
    "utf-8",
  );
  assert.match(src, /const before = stateOf\(log, today, taskId\)/);
  assert.match(src, /p\.ordered === true && !before\.ordered/);
  assert.match(src, /p\.received === true && !before\.received/);
});

/* ------------------------------------------------------------------ */
/* 가설을 이을 수 있는가                                                */
/* ------------------------------------------------------------------ */

/**
 * ★ `교육_완료`와 `설문_응답`을 잇는 열쇠.
 *
 * 검증 대상 가설이 *"교육이 얼마나 걸렸나 + 선배에게 몇 번 물었나"*를
 * 붙여 보는 것이다. `설문_응답`에 `runId`가 없으면 그게 안 된다.
 *
 * 그리고 **끝낼 때 `save(null)`로 `run`을 비우므로**(공용 태블릿이라
 * 진도를 남기면 다음 신입에게 보인다) `run?.runId`로는 못 얻는다.
 * `lastRunId`로 따로 붙들어야 한다.
 */
test("★ 교육 설문이 runId를 담는다 (교육_완료와 잇는 열쇠)", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "TrainingMode.tsx"),
    "utf-8",
  );
  // 끝낼 때 붙들고
  assert.match(src, /setLastRunId\(run\.runId\)/, "끝낼 때 runId를 안 붙든다");
  // 설문이 그걸 쓰고
  const m = src.match(/log\("설문_응답",[\s\S]{0,800}?\}\);/);
  assert.ok(m, "설문_응답 이벤트를 못 찾았다");
  assert.match(m[0], /runId: lastRunId/, "설문에 runId가 없다 — 가설을 못 잇는다");
  // 새 회차에서 비운다
  assert.ok(
    (src.match(/setLastRunId\(null\)/g) ?? []).length >= 2,
    "새 회차·처음으로에서 lastRunId를 안 비운다 — 지난 회차 열쇠가 잘못 붙는다",
  );
});

/**
 * ★ 설문이 완주자에게만 뜨면 표본이 치우친다.
 *
 * 질문은 "오늘 선배에게 몇 번 물었나"다 — 체크리스트 완주와 무관한 하루 끝
 * 질문이고, 그날 해당 없는 항목이 있으면 100%가 될 수 없다.
 * 완주에 매달아 두면 **중도 이탈자는 기록이 0건**이 된다.
 */
test("★ 체크리스트 설문이 완주 조건에 매달려 있지 않다", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "ChecklistView.tsx"),
    "utf-8",
  );
  assert.match(
    src,
    /\{hydrated && doneCount > 0 && \(/,
    "설문이 다시 finished 조건에 걸렸다 — 중도 이탈자 표본이 사라진다",
  );
  // 분석에서 완주자와 이탈자를 구분할 수 있어야 한다
  const m = src.match(/log\("설문_응답",[\s\S]{0,800}?\}\);/);
  assert.ok(m);
  for (const f of ["finished", "doneCount", "total"]) {
    assert.ok(m[0].includes(f), `설문에 ${f}가 없다 — 완주자·이탈자를 못 나눈다`);
  }
});

test("체크 이벤트가 critical을 함께 남긴다 (2차 지표)", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "ChecklistView.tsx"),
    "utf-8",
  );
  const m = src.match(/log\("체크",[\s\S]{0,800}?\}\);/);
  assert.ok(m, "체크 이벤트를 못 찾았다");
  assert.match(m[0], /critical:/, "critical이 없다 — '위생 항목 누락'을 못 센다");
  assert.match(m[0], /doneCount/, "doneCount가 없다 — 중도 이탈 지점을 못 본다");
});

/* ------------------------------------------------------------------ */
/* 서버가 받아주는가 — 어긋나면 이벤트가 조용히 버려진다               */
/* ------------------------------------------------------------------ */

/**
 * ★ `/api/log` 는 모르는 이벤트 이름을 400으로 막는다(공개 엔드포인트라
 *   아무 문자열이나 디스크에 쌓이면 안 된다). 그런데 `logEvent` 는
 *   **실패를 무시한다** — 화면을 막으면 안 되기 때문이다.
 *
 *   그래서 코드가 새 이벤트를 쏘는데 서버 목록에 안 넣으면 **아무 오류도
 *   없이 그 이벤트만 사라진다.** 이 테스트가 그 어긋남을 잡는다.
 */
test("★ 코드가 쏘는 이벤트를 /api/log 가 전부 받아준다", () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), "src", "app", "api", "log", "route.ts"),
    "utf-8",
  );
  const m = route.match(/const ALLOWED = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(m, "route.ts 의 ALLOWED 목록을 못 찾았다");
  const allowed = [...m[1].matchAll(/"([a-z_가-힣]+)"/g)].map((x) => x[1]).sort();

  const actual = eventNames();
  const rejected = actual.filter((e) => !allowed.includes(e));
  const unused = allowed.filter((e) => !actual.includes(e));

  assert.deepEqual(
    { rejected, unused },
    { rejected: [], unused: [] },
    "화면이 쏘는 이벤트와 /api/log 의 ALLOWED 가 어긋났다. " +
      "rejected 는 서버가 400으로 버리는 것이고, 클라이언트는 그걸 모른다.",
  );
});

/**
 * ★ 저장 실패를 `{ok:true}` 로 덮지 않는다.
 *
 * Vercel 처럼 디스크가 읽기 전용인 곳에 올리면 한 줄도 안 쌓인다.
 * 예전에는 그래도 `{ok:true}` 를 돌려줘서 **지표가 0건인 것을 배포하고
 * 한참 뒤에야 알게 되는** 구조였다. 배포 점검에서 이 값을 본다.
 */
test("★ /api/log 가 저장 여부를 사실대로 돌려준다", () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), "src", "app", "api", "log", "route.ts"),
    "utf-8",
  );
  /* 2026-09-12 — 쌓는 곳이 둘이 되면서(서버 DB / 로컬 파일) 응답에 `sink` 가
     붙었다. 이 검사의 뜻은 그대로다 — **저장 여부를 덮지 않는다.**
     어디에 쌓였는지까지 보는 검사는 `tests/logSink.test.ts` 에 있다. */
  assert.match(
    route,
    /return Response\.json\(\{ ok: true, stored: sink !== "none", sink \}\)/,
    "저장 실패를 ok:true 로 덮고 있다 — 배포하면 지표 0건인 것을 모른다",
  );
  assert.doesNotMatch(
    route,
    /return Response\.json\(\{ ok: true \}\)/,
    "stored 없이 ok:true 만 돌려주는 경로가 남아 있다",
  );
});
