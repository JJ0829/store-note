import {
  AT_COOKIE,
  RT_COOKIE,
  authConfigured,
  isExpired,
  readCookie,
  whoAmI,
  /* ★ `@/` 가 아니라 상대경로다 — 테스트가 이 파일을 서버 없이 그대로 부른다 */
} from "../../../lib/serverSession.ts";
import {
  mailConfigured,
  mailFrom,
  parseMailRequest,
  sendOne,
} from "../../../lib/rosterMail.ts";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * 근무표 메일을 서버가 보낸다 (Resend · 2026-09-16)
 *
 * ★ 키(`RESEND_API_KEY`)는 여기서만 읽는다. 없으면 409 `not-configured` — 화면은
 *   예전처럼 메일 앱을 연다. 데모데이에 키가 없어도 버튼이 죽지 않는다.
 *
 * ★ 누가 보낼 수 있나
 *   로그인이 설정된 배포에서는 **사장님 계정만**. 아니면 누구나 우리 보낸이로
 *   메일을 쏠 수 있다 (스팸 → 도메인 평판이 깎이고 키가 정지된다).
 *   로그인이 설정돼 있지 않은 배포(데모)에서는 시도 제한만 건다.
 *
 * ★ 시도 제한은 메모리에 센다 — 서버가 여러 개면 각자 센다. 느리게 할 뿐이다.
 *   메일은 돈과 평판이 들어서 매장 PIN 보다 좁게 잡았다 (10분에 5번).
 * ------------------------------------------------------------------ */

const WINDOW_MS = 10 * 60_000;
const MAX_IN_WINDOW = 5;
const hits = new Map<string, number[]>();

function who(request: Request): string {
  const h = request.headers;
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** 0 이면 통과, 아니면 몇 ms 기다려야 하는지 */
function throttleMs(key: string, now = Date.now()): number {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_IN_WINDOW) {
    hits.set(key, recent);
    return WINDOW_MS - (now - recent[0]);
  }
  recent.push(now);
  hits.set(key, recent);
  return 0;
}

function bad(reason: string, status: number, extra: Record<string, unknown> = {}) {
  return Response.json({ ok: false, reason, ...extra }, { status });
}

export async function POST(request: Request) {
  if (!mailConfigured()) return bad("not-configured", 409);

  if (authConfigured()) {
    const cookie = request.headers.get("cookie");
    const access = readCookie(cookie, AT_COOKIE);
    const refresh = readCookie(cookie, RT_COOKIE);
    /* 낡았지만 갱신 토큰은 있다 = `/api/auth/me` 를 거쳐 다시 오면 된다.
       여기서 갱신하면 안 된다 — 갱신은 한 곳에서만 (`/api/data` 와 같은 이유) */
    if ((!access || isExpired(access)) && refresh) return bad("stale", 401);
    const me = await whoAmI(access);
    if (me.state !== "ok") return bad("login", 401);
  }

  const wait = throttleMs(who(request));
  if (wait > 0) return bad("too-many", 429, { waitSec: Math.ceil(wait / 1000) });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad("요청을 읽을 수 없습니다.", 400);
  }
  const parsed = parseMailRequest(body);
  if (!parsed.ok) return bad(parsed.reason, 400);

  const key = process.env.RESEND_API_KEY as string;
  const from = mailFrom();
  const sent: string[] = [];
  const failed: { to: string; reason: string }[] = [];

  /* 한 통씩, 잇따라. Resend 는 초당 2건이라 사이를 조금 띄운다 */
  for (const [i, to] of parsed.req.to.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 600));
    const r = await sendOne(key, from, to, parsed.req.subject, parsed.req.text);
    if (r.ok) sent.push(to);
    else failed.push({ to, reason: r.reason });
  }

  return Response.json({ ok: failed.length === 0, sent, failed });
}
