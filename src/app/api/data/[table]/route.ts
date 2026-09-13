import {
  AT_COOKIE,
  RT_COOKIE,
  authConfigured,
  isExpired,
  readCookie,
  refreshTokens,
  sessionCookies,
  whoAmI,
  /* ★ `@/` 가 아니라 상대경로다 — 테스트가 이 파일을 서버 없이 그대로 부른다.
   *  `/api/auth/me` · `/api/store-unlock` 과 같은 이유. */
} from "../../../../lib/serverSession.ts";
import { isAllowedTable } from "../../../../lib/serverData.ts";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * 매장 데이터 — 서버에 넣고 서버에서 읽는다
 *
 * ★ 왜 브라우저가 Supabase 를 직접 안 부르나
 *   토큰이 **httpOnly 쿠키**에 있어서 자바스크립트가 못 읽는다. 일부러 그렇게
 *   뒀다(`serverSession.ts`). 그러니 서버가 쿠키를 보고 대신 다녀온다.
 *
 * ★ 왜 지우지 않고 **덮어쓰기만** 하나 (upsert)
 *   매장에 태블릿이 두 대 있을 수 있다. 「내가 가진 것으로 전부 갈아끼우기」로
 *   만들면 **늦게 연 기기가 다른 기기의 기록을 지운다.** 출퇴근·근로계약은
 *   법정 3년 보존 대상이라 그 사고가 나면 복구할 방법이 없다.
 *   그래서 **넣고 고치기만 하고 지우지는 않는다.** 지우는 길은 따로 만든다.
 *
 * ★ store_id 는 **서버가 붙인다.** 브라우저가 보낸 값은 무시한다 —
 *   믿으면 남의 매장에 줄을 넣을 수 있다. RLS 가 한 겹 더 막지만
 *   여기서도 막는 것이 맞다(막는 곳이 하나뿐이면 그게 뚫릴 때 끝이다).
 * ------------------------------------------------------------------ */

type Ctx = { params: Promise<{ table: string }> };

function bad(reason: string, status = 400) {
  return Response.json({ ok: false, reason }, { status });
}

/** 쿠키 → 접근 토큰. 만료됐으면 갱신해서 새 쿠키까지 돌려준다 */
async function session(request: Request) {
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
  return { access, who, fresh };
}

const MAX_BODY = 512 * 1024;

export async function GET(request: Request, ctx: Ctx) {
  if (!authConfigured()) return bad("not-configured", 409);
  const { table } = await ctx.params;
  if (!isAllowedTable(table)) return bad("unknown-table", 404);

  const { access, who, fresh } = await session(request);
  if (who.state !== "ok") return bad(who.state, 401);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return bad("not-configured", 409);

  let res: Response;
  try {
    res = await fetch(
      `${url}/rest/v1/${table}?select=*&store_id=eq.${encodeURIComponent(who.storeId)}`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${access}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
  } catch {
    return bad("서버에 연결하지 못했습니다.", 504);
  }
  if (!res.ok) return bad(`서버가 거절했습니다 (${res.status}).`, 502);

  const rows = (await res.json()) as unknown[];
  const out = Response.json({ ok: true, rows });
  if (fresh) for (const c of fresh) out.headers.append("Set-Cookie", c);
  return out;
}

export async function PUT(request: Request, ctx: Ctx) {
  if (!authConfigured()) return bad("not-configured", 409);
  const { table } = await ctx.params;
  if (!isAllowedTable(table)) return bad("unknown-table", 404);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return bad("too-large", 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return bad("요청을 읽을 수 없습니다.");
  }
  const rows = (body as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(rows)) return bad("rows 가 배열이 아닙니다.");
  if (rows.length === 0) return Response.json({ ok: true, wrote: 0 });

  const { access, who, fresh } = await session(request);
  if (who.state !== "ok") return bad(who.state, 401);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return bad("not-configured", 409);

  /* ★ store_id 를 여기서 덮어쓴다. 브라우저가 보낸 값은 쓰지 않는다 */
  const safe = rows.map((r) => ({
    ...(r as Record<string, unknown>),
    store_id: who.storeId,
  }));

  let res: Response;
  try {
    res = await fetch(`${url}/rest/v1/${table}?on_conflict=id`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
        /* `resolution=merge-duplicates` 가 upsert 다. 없으면 같은 id 에서 409 */
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(safe),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return bad("서버에 연결하지 못했습니다.", 504);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return bad(`서버가 거절했습니다 (${res.status}). ${detail.slice(0, 200)}`, 502);
  }

  const out = Response.json({ ok: true, wrote: safe.length });
  if (fresh) for (const c of fresh) out.headers.append("Set-Cookie", c);
  return out;
}
