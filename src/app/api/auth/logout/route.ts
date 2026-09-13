import { clearCookies } from "../../../../lib/serverSession.ts";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * 로그아웃 — 쿠키 두 개를 즉시 만료시킨다.
 *
 * ★ 공용 태블릿이라 이게 중요하다. 사장님이 로그인한 채로 두면
 *   다음 사람이 매출·시급을 그대로 본다.
 *
 * ⚠️ Supabase 쪽 갱신 토큰까지 무효로 만들지는 않는다. 쿠키만 지운다 —
 *   토큰을 이미 훔쳐간 경우는 못 막는다. 그건 Supabase 대시보드에서
 *   해당 사용자의 세션을 끊어야 한다.
 * ------------------------------------------------------------------ */
export async function POST() {
  const res = Response.json({ ok: true });
  for (const c of clearCookies()) res.headers.append("Set-Cookie", c);
  return res;
}
