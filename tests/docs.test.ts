import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------ *
 * 문서가 코드에 대해 하는 말이 아직 사실인가.
 *
 * ★ 왜 만들었나 (2026-09-11)
 *   이 저장소에서 반복해서 터진 실패가 하나 있다 —
 *   **저장소 안에 들어간 것은 실행해서 확인했고, 문서로 나간 것은 안 했다.**
 *   그래서 문서가 조용히 낡는다. 오류도 안 나고 테스트도 안 걸린다.
 *   나중에 심사에서 읽힐 때에야 틀린 게 드러난다.
 *
 *   실제로 이걸 처음 돌렸을 때 `03_ERD.md` 가 **배포 전 보안 조치 3건을
 *   "미구현" 으로 적고 있었다.** 셋 다 이미 구현돼 있었다 —
 *   매장 PIN · robots.txt · noindex. 그 문서를 심사위원이 읽으면
 *   "보안이 안 됐다" 고 판단한다. 코드가 아니라 문서가 제품을 깎아먹는다.
 *
 * ★ 무엇을 검사하나 — **기계가 판정할 수 있는 것만** 본다
 *   1. 문서가 가리키는 소스 파일이 실제로 있는가
 *   2. 문서가 가리키는 화면 주소가 실제로 있는가
 *   3. 문서가 말하는 저장소 키가 코드에 있는가
 *
 *   "이 설명이 맞는 설명인가" 는 기계가 못 본다. 그건 사람이 읽어야 한다.
 *   대신 **이름이 어긋나는 것**만은 절대 안 놓친다.
 *
 * ★ 정규식이 한글까지 받는 이유
 *   처음엔 ASCII 만 봤는데, **그러면 `presentation/매장수첩.html` 을 통째로 안 본다.**
 *   실제로 이 테스트를 만들고 나서 일부러 거짓 이름을 심어 봤더니
 *   한글 이름은 하나도 안 걸렸다. 검사한다고 믿는데 안 하는 게 제일 위험하다.
 *
 * ★ 예외 목록에는 반드시 이유를 적는다
 *   이유 없이 예외로 빼면 다음 사람이 "왜 빠져 있지" 를 다시 조사해야 한다.
 *   그리고 **필요 없어진 예외는 테스트가 지우라고 말한다**(마지막 검사) —
 *   예외 목록 자체가 낡는 것을 막는다.
 * ------------------------------------------------------------------ */

const ROOT = process.cwd();

/** 문서에 이름이 나오지만 저장소에 없어도 되는 파일과 그 이유 */
const 파일_예외: Record<string, string> = {
  "data/events.jsonl":
    "지표 파일. 런타임에 만들어지고 .gitignore 대상이다",
  "data/events.test.jsonl":
    "재측정을 원본이 아니라 사본에 하라는 제안이다. 실재하는 파일이 아니다",
  "data/views.json":
    "취소선 안의 과거 오기 기록 (00_PROJECT_CURRENT). 실제 이름은 events.jsonl 이었다",
  "public/app.html":
    "V-05 조치로 삭제했다. 문서의 언급은 '삭제했다' 는 기록이다",
  "src/app/robots.ts":
    "안 만들었다. public/robots.txt 하나로 충분하다고 판단했다",
  "src/middleware.ts":
    "미구현. 서버 인증(D-007 이후)에서 만든다",
  "src/app/legal/page.tsx":
    "미구현. 라이선스 고지 화면 계획 (04_라이선스감사)",
  "src/app/terms/page.tsx":
    "미구현. 이용약관 화면 계획 (09_이용약관)",
  "src/app/privacy/page.tsx":
    "미구현. 개인정보처리방침 화면 계획 (09_이용약관)",
};

/** 문서에 나오지만 실제 라우트가 아니어도 되는 주소와 그 이유 */
const 주소_예외: Record<string, string> = {
  "/p": "접두어를 가리킨 것. 실제 라우트는 /p/[slug] 다",
  "/t": "접두어를 가리킨 것. 실제 라우트는 /t/[slug] 다",
  "/xxx": "설명용 가짜 주소 (16_정보구조도)",
  "/legal": "미구현. 라이선스 고지 화면 계획",
  "/terms": "미구현. 이용약관 화면 계획",
  "/privacy": "미구현. 개인정보처리방침 화면 계획",
  "/notice": "미구현. 공지 화면 계획",
  "/unlock": "미구현. 서버 인증 단계의 잠금 해제 화면 계획",
  "/api/unlock": "미구현. 위와 같음. 지금 있는 것은 /api/store-unlock 이다",
};

/** 문서에 나오지만 코드에 그 이름 그대로는 없는 저장소 키와 그 이유 */
const 키_예외: Record<string, string> = {
  "sop:run": "실제 키는 sop:run:{슬러그} 다. 화면에서 조립하므로 상수로 안 나타난다",
};

// ── 훑기 ─────────────────────────────────────────────────────────────
function 마크다운_전부(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git", ".claude"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) 마크다운_전부(p, out);
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

const 문서 = 마크다운_전부(path.join(ROOT, "docs")).concat(
  ["README.md", "CLAUDE.md"].map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f)),
);

/** 실제 존재하는 화면·API 주소 */
function 실제_주소(): Set<string> {
  const out = new Set<string>(["/"]);
  const walk = (dir: string, prefix = "") => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith("(")) continue;
      const p = prefix + "/" + e.name;
      const here = path.join(dir, e.name);
      if (fs.existsSync(path.join(here, "page.tsx")) || fs.existsSync(path.join(here, "route.ts")))
        out.add(p);
      walk(here, p);
    }
  };
  walk(path.join(ROOT, "src/app"));
  return out;
}

/** 코드에 실제로 쓰인 저장소 키 */
function 실제_키(): Set<string> {
  let text = "";
  for (const d of ["src/lib", "src/components"])
    for (const f of fs.readdirSync(path.join(ROOT, d)))
      text += fs.readFileSync(path.join(ROOT, d, f), "utf-8");
  return new Set([...text.matchAll(/"(sop:[가-힣A-Za-z]+)"/g)].map((m) => m[1]));
}

const 파일_정규식 =
  /`((?:src|tests|data|public|presentation|db)\/[가-힣A-Za-z0-9_\-./[\]]+?\.(?:ts|tsx|json|jsonl|html|sql|dbml|js|css))`/g;
const 주소_정규식 = /`(\/(?:[a-z가-힣-]+)(?:\/[a-z가-힣0-9[\]-]+)*)`/g;
const 키_정규식 = /`(sop:[가-힣A-Za-z]+)`/g;

/** 어긋난 것 → 그 이름이 나온 문서들 */
function 모으기(
  re: RegExp,
  통과: (v: string) => boolean,
): Map<string, Set<string>> {
  const bad = new Map<string, Set<string>>();
  for (const doc of 문서) {
    const t = fs.readFileSync(doc, "utf-8");
    for (const m of t.matchAll(re)) {
      if (통과(m[1])) continue;
      const rel = path.relative(ROOT, doc).replace(/\\/g, "/");
      if (!bad.has(m[1])) bad.set(m[1], new Set());
      bad.get(m[1])!.add(rel);
    }
  }
  return bad;
}

const 보고 = (bad: Map<string, Set<string>>) =>
  [...bad.entries()]
    .map(([k, v]) => `\n  ${k}\n      ← ${[...v].join(", ")}`)
    .join("");

// ── 검사 ─────────────────────────────────────────────────────────────

test("문서가 가리키는 소스 파일이 실제로 있다", () => {
  const bad = 모으기(
    파일_정규식,
    (f) => fs.existsSync(path.join(ROOT, f)) || f in 파일_예외,
  );
  assert.equal(
    bad.size,
    0,
    `문서가 없는 파일을 가리킨다. 파일 이름이 바뀌었거나 문서가 낡았다.` +
      ` 일부러라면 tests/docs.test.ts 의 파일_예외 에 이유와 함께 적을 것:${보고(bad)}`,
  );
});

test("문서가 가리키는 화면 주소가 실제로 있다", () => {
  const 주소 = 실제_주소();
  const bad = 모으기(주소_정규식, (r) => {
    if (r in 주소_예외 || 주소.has(r)) return true;
    // 동적 구간을 [slug] 로 바꿔서도 맞춰 본다 (/prep/afternoon → /prep/[slug])
    const norm =
      "/" +
      r
        .split("/")
        .filter(Boolean)
        .map((s, i) => (i === 0 || /^\[.+\]$/.test(s) ? s : "[slug]"))
        .join("/");
    return 주소.has(norm);
  });
  assert.equal(
    bad.size,
    0,
    `문서가 없는 화면 주소를 가리킨다. 라우트가 바뀌었거나 문서가 낡았다.` +
      ` 계획 단계라면 주소_예외 에 이유와 함께 적을 것:${보고(bad)}`,
  );
});

test("문서가 말하는 저장소 키가 코드에 있다", () => {
  const 키 = 실제_키();
  const bad = 모으기(키_정규식, (k) => 키.has(k) || k in 키_예외);
  assert.equal(
    bad.size,
    0,
    `문서가 코드에 없는 저장소 키를 말한다. 키 이름이 바뀌면 백업·복원이 조용히 깨진다:${보고(bad)}`,
  );
});

test("★ 예외 목록 자체가 낡지 않았다", () => {
  /* 예외로 빼둔 것이 나중에 실제로 만들어지면, 예외는 거짓말이 된다.
     그러면 그 파일이 지워졌을 때 아무도 못 잡는다. 그래서 지우라고 말한다. */
  const 쓸모없는: string[] = [];
  for (const f of Object.keys(파일_예외))
    if (fs.existsSync(path.join(ROOT, f)))
      쓸모없는.push(`파일_예외 "${f}" — 이제 실제로 있다`);

  const 주소 = 실제_주소();
  for (const r of Object.keys(주소_예외))
    if (주소.has(r)) 쓸모없는.push(`주소_예외 "${r}" — 이제 실제로 있다`);

  const 키 = 실제_키();
  for (const k of Object.keys(키_예외))
    if (키.has(k)) 쓸모없는.push(`키_예외 "${k}" — 이제 실제로 있다`);

  assert.deepEqual(
    쓸모없는,
    [],
    `예외가 필요 없어졌다. 지워야 앞으로 그것이 사라질 때 테스트가 잡는다:\n  ` +
      쓸모없는.join("\n  "),
  );
});

test("개수를 현재형으로 박아두지 않는다", () => {
  /* ★ 이 저장소는 같은 교훈을 이미 한 번 배웠다 —
       c33bf08 "배포/인수인계에서 커밋 수를 박지 않는다. 커밋할 때마다 낡는다"
     테스트 개수도 같다. 실제로 이 검사를 만들 때
     07_코딩_배포가이드 는 "187개 · 12파일" 이라고 적고 있었다(실제 542개 · 30파일).

     그렇다고 숫자를 테스트로 못 박을 수도 없다 —
     반복문으로 만드는 테스트가 있어서 정적으로 세면 3개가 어긋난다.

     그래서 **숫자가 아니라 규칙**을 강제한다:
       · 현재 값을 말하는 곳은 docs/00_PROJECT_CURRENT.md 한 곳뿐이다
       · 다른 곳에서 개수를 적으려면 **언제 기준인지** 밝혀야 한다
         ("2026-09-04" 같은 날짜 · "당시" · "작성 시점" · "기준")
     날짜가 붙은 숫자는 낡지 않는다. 그때는 사실이었기 때문이다. */
  const 정본 = "docs/00_PROJECT_CURRENT.md";
  const 시점표시 = /20\d\d-\d\d|당시|작성 시점|기준/;
  const 개수패턴 = /테스트\s*[0-9,]+\s*개|[0-9,]+\s*개\s*(?:전부\s*)?통과/;

  const 위반: string[] = [];
  for (const doc of 문서) {
    const rel = path.relative(ROOT, doc).replace(/\\/g, "/");
    if (rel === 정본) continue;
    for (const line of fs.readFileSync(doc, "utf-8").split(/\r?\n/)) {
      if (!개수패턴.test(line)) continue;
      if (시점표시.test(line)) continue;
      위반.push(rel + "\n      " + line.trim().slice(0, 110));
    }
  }
  assert.deepEqual(
    위반,
    [],
    "개수를 현재형으로 적었다. 커밋할 때마다 낡는다.\n" +
      "  · 지금 값은 " + 정본 + " 한 곳에만 적는다\n" +
      '  · 다른 곳은 "2026-09-04 당시" 처럼 시점을 밝히거나 npm run check 를 가리킬 것\n  ' +
      위반.join("\n  "),
  );
});

test("검사 대상이 실제로 있다 (조용히 0개를 훑고 통과하지 않게)", () => {
  /* ★ 이 검사가 없으면, 경로가 틀려서 문서를 한 개도 못 읽었을 때
     "어긋난 것 0건" 으로 통과해 버린다. 가장 위험한 통과다. */
  assert.ok(문서.length >= 20, `문서를 ${문서.length}개밖에 못 찾았다`);
  assert.ok(실제_주소().size >= 15, `라우트를 ${실제_주소().size}개밖에 못 찾았다`);
  assert.ok(실제_키().size >= 10, `저장소 키를 ${실제_키().size}개밖에 못 찾았다`);
});
