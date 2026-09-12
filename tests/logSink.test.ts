/* ------------------------------------------------------------------ *
 * 지표를 **어디에 쌓는가** — 조용히 0건이 되는 길을 막는다.
 *
 * ★ 왜 이 파일이 생겼나 (2026-09-12 · D-002 예외 조항)
 *   `/api/log` 가 서버 파일에만 쌓고 있었다. 배포 환경에서는 그 파일이
 *   요청 사이에 보존되지 않아서 **배포하는 순간 지표가 0건**이 된다.
 *   그런데 화면에는 아무 오류도 안 뜬다 — 나중에 분석하려 할 때야 안다.
 *   그때는 다시 못 모은다.
 *
 *   그래서 서버 DB 로 넣는 길을 더했고, **그 길이 끊어지는 방법 셋**을
 *   여기서 막는다. 셋 다 "돌아가는 것처럼 보이는데 안 쌓이는" 종류다.
 *
 * ⚠️ 여기서 하는 것은 **소스 검사**다. 실제로 들어가는지는 배포 후
 *   응답의 `sink` 가 "db" 인지 보는 것으로 확인한다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTE = path.join(ROOT, "src", "app", "api", "log", "route.ts");
const 마이그 = path.join(ROOT, "db", "migrations", "0001_events.sql");

const route = () => fs.readFileSync(ROUTE, "utf-8");
const sql = () => fs.readFileSync(마이그, "utf-8");

/* ── 1. 조용히 실패하는 길 ────────────────────────────────────────── */

test("★ 표에 권한(GRANT)을 준다 — 정책만으로는 한 줄도 안 들어간다", () => {
  /* 2026-09-12 에 실제로 여기서 걸렸다. 정책(RLS)은 «어느 줄을» 을 정하고
     권한은 «그 동작을 아예 할 수 있는가» 를 정한다. 정책만 만들면
     permission denied 가 나는데, 넣는 쪽이 실패를 삼키므로(화면이 멈추면
     안 되니까) **아무 오류도 안 보이고 표만 영원히 비어 있다.** */
  const s = sql();
  assert.match(
    s,
    /grant\s+insert\s+on\s+public\.events\s+to\s+anon/i,
    "anon 에 insert 권한이 없다 — 정책이 맞아도 한 줄도 안 들어간다",
  );
  assert.match(
    s,
    /grant\s+select\s+on\s+public\.events\s+to\s+authenticated/i,
    "authenticated 에 select 권한이 없다 — 나중에 아무도 못 읽는다",
  );
});

test("insert 를 `Prefer: return=minimal` 로 보낸다 (넣은 줄을 돌려받지 않는다)", () => {
  /* 이 표는 익명 읽기 권한이 없으므로 돌려받으려 하면 읽기가 필요해진다.
     지금 서버는 이 헤더가 없어도 안 돌려주지만, 그건 기본값에 기대는 것이다. */
  assert.match(
    route(),
    /Prefer:\s*"return=minimal"/,
    "return=minimal 이 빠졌다 — 서버 기본값이 바뀌면 insert 가 실패한다",
  );
});

test("★ 환경변수를 함수 안에서 읽는다 (모듈 바깥에서 읽으면 빌드 시점에 박힌다)", () => {
  const src = route();
  const 함수시작 = src.indexOf("async function 서버DB에");
  assert.ok(함수시작 > 0, "서버DB에 함수를 못 찾았다");

  const 바깥 = src.slice(0, 함수시작);
  assert.ok(
    !/process\.env\.SUPABASE/.test(바깥),
    "SUPABASE 환경변수를 모듈 바깥에서 읽는다 — 배포처에서 값을 넣어도 안 잡힌다",
  );
  assert.match(src.slice(함수시작), /process\.env\.SUPABASE_URL/);
  assert.match(src.slice(함수시작), /process\.env\.SUPABASE_ANON_KEY/);
});

test("★ 지표가 화면을 막지 않는다 (시간 제한이 걸려 있다)", () => {
  assert.match(
    route(),
    /AbortSignal\.timeout\(\s*\d+\s*\)/,
    "시간 제한이 없다 — DB 가 느리면 체크 한 번에 화면이 멈춘다",
  );
});

test("어디에 쌓였는지를 응답이 말한다 (`sink`)", () => {
  const src = route();
  assert.match(src, /sink:\s*"db"\s*\|\s*"file"\s*\|\s*"none"/);
  assert.match(src, /stored:\s*sink\s*!==\s*"none"/);
});

test("DB 가 안 되면 파일로 떨어지고, 그 반대가 아니다", () => {
  const src = route();
  const db = src.indexOf("await 서버DB에(record)");
  const 파일 = src.indexOf("appendFile");
  assert.ok(db > 0 && 파일 > db, "파일 쓰기가 DB 보다 먼저다 — 순서가 뒤집혔다");
});

/* ── 2. 의존성을 늘리지 않았는가 ──────────────────────────────────── */

test("★ SDK 를 안 깔았다 — 런타임 의존성은 여전히 셋뿐이다", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"),
  ) as { dependencies: Record<string, string> };

  assert.deepEqual(
    Object.keys(pkg.dependencies).sort(),
    ["next", "react", "react-dom"],
    "런타임 의존성이 늘었다 — 라이선스 감사(04)와 _라이선스_원자료.json 을 같이 고쳐야 한다",
  );
  assert.ok(
    !/@supabase/.test(route()),
    "route.ts 가 Supabase SDK 를 쓴다 — REST 라 fetch 로 된다",
  );
});

/* ── 3. 표가 「쌓기만」 하는가 ─────────────────────────────────────── */

test("★ 익명 키로 읽을 수 없다 (넣기만 된다)", () => {
  const s = sql();
  assert.match(s, /enable row level security/i, "줄 단위 접근통제가 안 켜져 있다");
  assert.match(s, /for insert to anon/i, "익명 insert 정책이 없다 — 지표가 안 쌓인다");
  assert.ok(
    !/for select to anon/i.test(s),
    "익명 select 정책이 있다 — 키가 새면 이용 기록을 통째로 읽힌다",
  );
});

test("표에 이름·금액 칸을 만들지 않았다", () => {
  const s = sql();
  for (const 금지 of ["staff_id", "name ", "amount", "total", "won", "price"]) {
    assert.ok(
      !new RegExp(`^\\s+${금지}`, "im").test(s),
      `events 표에 «${금지}» 칸이 생겼다 — 지표 표가 개인정보·영업비밀 표가 된다`,
    );
  }
});

test("환경변수 예시에 NEXT_PUBLIC_ 이 안 붙어 있다", () => {
  const env = fs.readFileSync(path.join(ROOT, ".env.example"), "utf-8");
  assert.match(env, /^SUPABASE_URL=/m, "SUPABASE_URL 예시가 없다");
  assert.match(env, /^SUPABASE_ANON_KEY=/m, "SUPABASE_ANON_KEY 예시가 없다");
  assert.ok(
    !/NEXT_PUBLIC_SUPABASE/.test(env),
    "NEXT_PUBLIC_ 이 붙었다 — 브라우저 번들에 박힌다",
  );
});
