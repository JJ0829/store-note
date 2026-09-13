import {
  AT_COOKIE,
  RT_COOKIE,
  authConfigured,
  isExpired,
  readCookie,
  refreshTokens,
  sessionCookies,
  whoAmI,
} from "../../../../lib/serverSession.ts";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * 지금 누가 로그인해 있나.
 *
 * ★ 첫 화면을 여기서 막지 않으려고 **따로 뺀 라우트**다.
 *   서버 컴포넌트 안에서 물어보면 매장 태블릿이 홈을 그릴 때마다
 *   Supabase 왕복 두 번을 기다린다. 화면이 먼저 뜨고 배지가 나중에 붙는 게 낫다.
 *
 * ★ **토큰 갱신도 여기서 한다.** 접근 토큰은 한 시간이면 만료되는데,
 *   서버 컴포넌트는 쿠키를 새로 못 굽는다(라우트 핸들러만 된다).
 *   그래서 만료됐으면 갱신 토큰으로 새로 받아 쿠키를 다시 내려준다 —
 *   **매장 태블릿은 하루 종일 켜져 있으므로 이게 없으면 한 시간마다 로그아웃된다.**
 *
 * ⚠️ 돌려주는 것은 **이름과 매장 이름까지**다. 토큰은 절대 안 실어 보낸다 —
 *   실으면 httpOnly 로 둔 뜻이 없어진다.
 * ------------------------------------------------------------------ */
export async function GET(request: Request) {
  if (!authConfigured()) {
    return Response.json({ state: "off" });
  }

  const cookie = request.headers.get("cookie");
  let access = readCookie(cookie, AT_COOKIE);
  const refresh = readCookie(cookie, RT_COOKIE);
  let fresh: string[] | null = null;

  if ((!access || isExpired(access)) && refresh) {
    const t = await refreshTokens(refresh);
    if (t) {
      access = t.access;
      fresh = sessionCookies(t);
    } else {
      access = undefined;
    }
  }

  const who = await whoAmI(access);
  const res = Response.json(who);
  if (fresh) for (const c of fresh) res.headers.append("Set-Cookie", c);
  return res;
}
