import {
  authConfigured,
  sessionCookies,
  signIn,
  /* ★ `@/` 가 아니라 상대경로다 — `/api/store-unlock` 과 같은 이유.
   *  테스트가 이 파일을 그대로 불러서 부른다(서버를 안 띄운다). */
} from "../../../../lib/serverSession.ts";
import {
  noteFailure,
  noteSuccess,
  throttleCheck,
} from "../../../../lib/serverGate.ts";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * 로그인.
 *
 * 비밀번호는 **여기를 지나갈 뿐** 어디에도 안 남는다. Supabase 로 넘기고
 * 받은 토큰만 httpOnly 쿠키에 담는다.
 *
 * ⚠️ 시도 제한은 `/api/store-unlock` 이 쓰는 것과 **같은 메모리**를 쓴다.
 *   서버가 여러 개면 각자 따로 센다 — 느리게 할 뿐 못 막는다.
 *   진짜 방어는 Supabase 쪽 로그인 제한이다.
 * ------------------------------------------------------------------ */

function who(request: Request): string {
  const h = request.headers;
  return (
    "login:" +
    (h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      "unknown")
  );
}

export async function POST(request: Request) {
  if (!authConfigured()) {
    /* 환경변수가 없으면 로그인이라는 것이 없다. 화면도 이 경우 버튼을 안 띄운다 */
    return Response.json({ ok: false, reason: "not-configured" }, { status: 409 });
  }

  const key = who(request);
  const waitMs = throttleCheck(key);
  if (waitMs > 0) {
    return Response.json(
      { ok: false, reason: "too-many", waitSec: Math.ceil(waitMs / 1000) },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, reason: "bad-request" }, { status: 400 });
  }
  const email = (body as { email?: unknown } | null)?.email;
  const password = (body as { password?: unknown } | null)?.password;
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return Response.json({ ok: false, reason: "bad-request" }, { status: 400 });
  }

  const tokens = await signIn(email, password);
  if (!tokens) {
    noteFailure(key);
    /* ★ "이메일이 없다" 와 "비밀번호가 틀렸다" 를 나누지 않는다 —
       나누면 어느 이메일이 이 매장 계정인지 알려주는 셈이 된다 */
    return Response.json({ ok: false, reason: "wrong" }, { status: 401 });
  }

  noteSuccess(key);
  const res = Response.json({ ok: true });
  for (const c of sessionCookies(tokens)) res.headers.append("Set-Cookie", c);
  return res;
}
