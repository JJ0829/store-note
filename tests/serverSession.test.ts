/* ------------------------------------------------------------------ *
 * 로그인 — 서버가 들고 있는 세션.
 *
 * ★ 왜 이게 필요해졌나 (2026-09-13)
 *   `schema_v2` 의 표 37개에 걸린 격리 정책은 `auth.uid()` 를 본다.
 *   **로그인이 없으면 앱이 그 표에 한 줄도 못 넣는다** — 그래서 출퇴근·매출이
 *   `events`(발자국) 에만 남고 서랍은 계속 비어 있었다.
 *
 * ★ 여기서 못 박는 것은 셋이다.
 *   1. 토큰이 **httpOnly 쿠키**에만 있고 화면으로 안 나간다
 *   2. **비밀번호를 어디에도 안 남긴다**
 *   3. 설정이 없으면 **로그인이라는 것이 아예 없다** (없는 기능을 광고하지 않는다)
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  AT_COOKIE,
  RT_COOKIE,
  authConfigured,
  clearCookies,
  isExpired,
  readCookie,
  readToken,
  sessionCookies,
} from "../src/lib/serverSession.ts";

function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const before: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    before[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** 서명은 아무 값이나 — 우리는 검사하지 않는다 (Supabase 가 한다) */
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o), "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.signature`;
}

/* ------------------------------------------------------------------ */
/* 설정이 없으면 로그인이라는 것이 없다                                 */
/* ------------------------------------------------------------------ */

test("★ SUPABASE 설정이 없으면 로그인이 꺼져 있다", () => {
  withEnv({ SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined }, () => {
    assert.equal(authConfigured(), false);
  });
  withEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: undefined }, () => {
    assert.equal(authConfigured(), false, "키만 빠져도 켜지면 안 된다");
  });
  withEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" }, () => {
    assert.equal(authConfigured(), true);
  });
});

/* ------------------------------------------------------------------ */
/* 쿠키                                                                */
/* ------------------------------------------------------------------ */

test("★ 토큰 쿠키는 httpOnly 다 (스크립트가 못 읽는다)", () => {
  const cs = sessionCookies({ access: "a", refresh: "r", expiresIn: 3600 });
  assert.equal(cs.length, 2);
  for (const c of cs) {
    assert.match(c, /HttpOnly/, `httpOnly 가 빠졌다: ${c}`);
    assert.match(c, /SameSite=Lax/, `SameSite 가 빠졌다: ${c}`);
    assert.match(c, /Path=\//);
  }
});

test("갱신 토큰이 접근 토큰보다 오래 산다 (한 시간마다 로그아웃되면 안 된다)", () => {
  const [at, rt] = sessionCookies({ access: "a", refresh: "r", expiresIn: 3600 });
  const age = (c: string) => Number(/Max-Age=(\d+)/.exec(c)?.[1] ?? "0");
  assert.equal(age(at), 3600);
  assert.ok(age(rt) > age(at), "갱신 토큰이 더 오래 살아야 이어서 쓴다");
});

test("로그아웃은 두 쿠키를 즉시 만료시킨다", () => {
  const cs = clearCookies();
  assert.equal(cs.length, 2);
  assert.ok(cs.some((c) => c.startsWith(`${AT_COOKIE}=`)));
  assert.ok(cs.some((c) => c.startsWith(`${RT_COOKIE}=`)));
  for (const c of cs) assert.match(c, /Max-Age=0/, `안 지워진다: ${c}`);
});

test("readCookie: 한 칸만 정확히 꺼낸다", () => {
  const h = `other=1; ${AT_COOKIE}=abc.def.ghi; ${RT_COOKIE}=zzz`;
  assert.equal(readCookie(h, AT_COOKIE), "abc.def.ghi");
  assert.equal(readCookie(h, RT_COOKIE), "zzz");
  assert.equal(readCookie(h, "없는것"), undefined);
  assert.equal(readCookie(null, AT_COOKIE), undefined);
  // ★ 이름이 겹쳐 보이는 것에 안 걸린다 — sn_at 을 찾는데 xsn_at 이 걸리면 안 된다
  assert.equal(readCookie(`x${AT_COOKIE}=nope`, AT_COOKIE), undefined);
  // 빈 값은 없는 것으로 본다 (로그아웃이 빈 값으로 덮는다)
  assert.equal(readCookie(`${AT_COOKIE}=`, AT_COOKIE), undefined);
});

/* ------------------------------------------------------------------ */
/* 토큰 읽기                                                           */
/* ------------------------------------------------------------------ */

test("readToken: 서명은 안 보고 sub·exp 만 꺼낸다", () => {
  const t = fakeJwt({ sub: "11111111-1111-1111-1111-111111111111", exp: 1789200000 });
  const got = readToken(t);
  assert.equal(got?.sub, "11111111-1111-1111-1111-111111111111");
  assert.equal(got?.exp, 1789200000);
  assert.equal(readToken("쓰레기"), null);
  assert.equal(readToken(undefined), null);
});

test("★ 만료를 여유 있게 본다 (보내는 도중에 넘어가면 안 된다)", () => {
  const now = 1_000_000;
  assert.equal(isExpired(fakeJwt({ exp: now + 3600 }), now), false);
  assert.equal(isExpired(fakeJwt({ exp: now - 1 }), now), true);
  // 10초 남은 것은 **만료로 친다** — 왕복하는 사이에 넘어간다
  assert.equal(isExpired(fakeJwt({ exp: now + 10 }), now), true);
  // exp 가 아예 없으면 믿지 않는다
  assert.equal(isExpired(fakeJwt({ sub: "x" }), now), true);
  assert.equal(isExpired(undefined, now), true);
});

/* ------------------------------------------------------------------ */
/* ★ 새면 안 되는 것                                                   */
/* ------------------------------------------------------------------ */

const 소스 = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf-8");

/**
 * 주석을 걷어낸 **코드만**.
 *
 * ★ 이걸 안 하면 «localStorage 에 안 넣는다» 라고 적어둔 주석이
 *   "localStorage 를 쓴다" 로 걸린다. `metrics.test.ts` 가 같은 함정에
 *   한 번 빠져서 «주석에 적힌 경로는 세지 않는다» 를 남겨뒀다.
 */
const 코드 = (p: string) =>
  소스(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

test("★ 비밀번호를 어디에도 저장하지 않는다", () => {
  const form = 코드("src/components/LoginForm.tsx");
  assert.ok(
    !/localStorage|sessionStorage|document\.cookie/.test(form),
    "로그인 화면이 저장소를 건드린다 — 비밀번호가 남을 수 있다",
  );
  const route = 코드("src/app/api/auth/login/route.ts");
  assert.ok(
    !/localStorage|writeFile|appendFile/.test(route),
    "로그인 라우트가 무언가를 적고 있다 — 비밀번호가 남는 경로가 된다",
  );
});

test("★ 토큰을 화면으로 돌려보내지 않는다 (httpOnly 로 둔 뜻이 없어진다)", () => {
  const me = 소스("src/app/api/auth/me/route.ts");
  assert.ok(
    !/Response\.json\([^)]*access/.test(me),
    "/api/auth/me 가 토큰을 실어 보낸다",
  );
  const lib = 소스("src/lib/serverSession.ts");
  // Who 타입에 토큰 칸이 없어야 한다
  /* ★ `\r?` 를 빼면 안 된다. 이 저장소는 체크아웃할 때 CRLF 로 바뀌어서,
     `\n\n` 만 찾으면 **파일이 멀쩡한데 "못 찾았다" 로 실패한다** (2026-09-14). */
  const who = /export type Who =([\s\S]*?)\r?\n\r?\n/.exec(lib)?.[1] ?? "";
  assert.ok(who.length > 0, "Who 타입을 못 찾았다");
  assert.ok(
    !/token/i.test(who),
    `«나는 누구인가» 에 토큰이 섞였다: ${who}`,
  );
});

test("★ 익명 키에 NEXT_PUBLIC_ 을 붙이지 않는다 (번들에 박힌다)", () => {
  for (const p of [
    "src/lib/serverSession.ts",
    "src/app/api/auth/login/route.ts",
    "src/app/api/auth/me/route.ts",
    "src/components/LoginForm.tsx",
    "src/components/SessionBadge.tsx",
  ]) {
    assert.ok(
      !/NEXT_PUBLIC_SUPABASE/.test(소스(p)),
      `${p} 가 키를 브라우저로 내보낸다`,
    );
  }
});

test("★ 브라우저 쪽 코드가 Supabase 를 직접 부르지 않는다", () => {
  /* 직접 부르려면 익명 키가 브라우저에 있어야 한다. 그러면 그 키로
     아무나 /rest/v1 을 두드릴 수 있다 — 서버 라우트를 거치게 한다.
     (촬영 업로드만 예외이고, 그건 **서명된 한 번짜리 주소**를 서버가 만들어 준다) */
  for (const p of ["src/components/LoginForm.tsx", "src/components/SessionBadge.tsx"]) {
    assert.ok(
      !/supabase\.co|\/auth\/v1\/|\/rest\/v1\//.test(코드(p)),
      `${p} 가 Supabase 를 직접 부른다`,
    );
  }
});

test("로그인 실패 이유를 자세히 말하지 않는다", () => {
  const route = 소스("src/app/api/auth/login/route.ts");
  /* "없는 이메일" 과 "틀린 비밀번호" 를 나누면 어느 주소가 이 매장 계정인지
     알려주는 셈이 된다. `/api/store-unlock` 과 같은 규율이다 */
  assert.ok(
    !/no-user|unknown-email|wrong-password/.test(route),
    "실패 이유가 갈려 있다 — 계정 존재 여부가 새어 나간다",
  );
  assert.match(route, /reason: "wrong"/, "실패를 한 가지로 뭉뚱그려야 한다");
});
