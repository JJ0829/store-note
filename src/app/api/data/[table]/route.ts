import {
  AT_COOKIE,
  RT_COOKIE,
  authConfigured,
  isExpired,
  readCookie,
  whoAmI,
  /* ★ `@/` 가 아니라 상대경로다 — 테스트가 이 파일을 서버 없이 그대로 부른다.
   *  `/api/auth/me` · `/api/store-unlock` 과 같은 이유. */
} from "../../../../lib/serverSession.ts";
import {
  CONFLICT_KEY,
  STAFF_BLOCKERS,
  STAFF_CASCADE,
  isAllowedTable,
} from "../../../../lib/serverData.ts";

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
 *   그래서 **넣고 고치기만 하고 지우지는 않는다.** 지우는 길은 하나뿐이다 —
 *   맨 아래 `DELETE`(표 하나를 통째로 비우기). **되돌리기(덮어쓰기) 버튼만 부른다.**
 *
 * ★ store_id 는 **서버가 붙인다.** 브라우저가 보낸 값은 무시한다 —
 *   믿으면 남의 매장에 줄을 넣을 수 있다. RLS 가 한 겹 더 막지만
 *   여기서도 막는 것이 맞다(막는 곳이 하나뿐이면 그게 뚫릴 때 끝이다).
 * ------------------------------------------------------------------ */

type Ctx = { params: Promise<{ table: string }> };

function bad(reason: string, status = 400) {
  return Response.json({ ok: false, reason }, { status });
}

/**
 * 쿠키 → 접근 토큰.
 *
 * ★★ **여기서 갱신하지 않는다** (2026-09-14 에 이것 때문에 로그아웃됐다)
 *
 *   Supabase 의 갱신 토큰은 **한 번 쓰면 폐기**되고, 같은 것을 두 번 보내면
 *   탈취로 보고 **세션 전체를 끊는다**(reuse detection).
 *
 *   처음엔 이 라우트도 `/api/auth/me` 처럼 갱신을 했다. 그러자 화면을 열 때
 *   배지(`/api/auth/me`)와 데이터 받기(`/api/data/punches`)가 **같은 갱신
 *   토큰으로 동시에** 갱신을 시도하고, 하나는 성공·하나는 재사용으로 걸려
 *   로그인이 통째로 풀렸다. 증상은 «로그인했는데 anon» 이라 원인을 찾기
 *   어렵다 — 갱신이 두 곳에 있다는 것이 안 보이기 때문이다.
 *
 *   그래서 **갱신하는 곳은 `/api/auth/me` 하나뿐**이다. 여기서는 토큰이
 *   낡았으면 `stale` 이라고만 말하고, 브라우저가 `me` 를 한 번 부른 뒤
 *   다시 온다 (`serverSync.ts`).
 */
async function session(request: Request) {
  const cookie = request.headers.get("cookie");
  const access = readCookie(cookie, AT_COOKIE);
  const refresh = readCookie(cookie, RT_COOKIE);

  /* 낡았지만 갱신 토큰은 있다 = 다시 부르면 된다. 로그아웃이 아니다 */
  if ((!access || isExpired(access)) && refresh) {
    return { access: undefined, who: { state: "stale" as const }, fresh: null };
  }
  const who = await whoAmI(access);
  return { access, who, fresh: null as string[] | null };
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
    res = await fetch(`${url}/rest/v1/${table}?on_conflict=${CONFLICT_KEY[table]}`, {
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

/* ------------------------------------------------------------------ *
 * 비우기 — 이 매장의 표 하나를 통째로. **되돌리기(덮어쓰기) 전용** (2026-09-16)
 *
 * ★ 위 「지우지 않는다」 규율의 유일한 예외다. 되돌리기는 정의가 «덮어쓰기» 다
 *   (`BackupView`: 「합치지 않고 덮어씁니다」). 태블릿만 덮어쓰고 서버를 그대로
 *   두면 다음 화면을 열 때 「서버에 줄이 있으면 서버가 이긴다」(pull) 규칙이
 *   **방금 되돌린 것을 도로 지운다.** 시연 데이터를 넣어도 근무표에 옛 직원이
 *   되살아나는 것이 그 증상이다.
 *
 * ★ 이 매장 것만 지운다 — `store_id` 를 서버가 붙이고 RLS 가 한 번 더 본다.
 *   본문은 받지 않는다. «어느 줄» 을 고를 수 없고 «이 표 전부» 만 된다.
 * ★ 화면을 열 때 자동으로 부르는 곳은 없다. 확인 화면 뒤의 버튼 하나뿐이다
 *   (`tests/serverSync.test.ts` 가 화면 넷이 안 부르는지 본다).
 * ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ *
 * 줄 하나만 지우기 — 직원 명단에서 한 명을 뺄 때 (2026-09-17)
 *
 * ★ 위의 「표 전부 비우기」와 **다른 길**이다. 주소에 `?id=` 가 붙으면 이쪽으로
 *   온다. 되돌리기는 여전히 표 전부를 비우고, 이쪽은 한 줄만 건드린다.
 *
 * ★ **직원만** 된다. 다른 표에 열어주면 «어느 줄이든 지우는 길» 이 되고,
 *   그건 «덮어쓰기만 한다» 는 규율을 통째로 무너뜨린다. 출퇴근 한 줄을 지우는
 *   일은 근태·인건비를 조용히 바꾸므로 그런 길을 열 거면 따로 설계해야 한다.
 * ------------------------------------------------------------------ */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const enc = encodeURIComponent;

type Conn = { url: string; key: string; access?: string };

function authHeaders(c: Conn): HeadersInit {
  return { apikey: c.key, Authorization: `Bearer ${c.access}`, Accept: "application/json" };
}

/**
 * 그 직원 앞으로 남아 있는 줄이 몇 개인가.
 *
 * ★ 못 물어봤으면 `null` 을 돌려준다. **0 으로 치면 안 된다** — 서버가 잠깐
 *   대답을 못 했다고 «기록이 없다» 로 읽으면 지우면 안 될 것을 지운다.
 */
async function countFor(
  c: Conn,
  table: string,
  storeId: string,
  staffId: string,
): Promise<number | null> {
  try {
    const res = await fetch(
      `${c.url}/rest/v1/${table}?select=staff_id&store_id=eq.${enc(storeId)}&staff_id=eq.${enc(staffId)}`,
      { headers: authHeaders(c), signal: AbortSignal.timeout(10_000), cache: "no-store" },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown;
    return Array.isArray(rows) ? rows.length : null;
  } catch {
    return null;
  }
}

/** 그 직원의 줄을 지운다. 지운 개수를 돌려준다 */
async function wipeFor(
  c: Conn,
  table: string,
  storeId: string,
  staffId: string,
  idColumn = "staff_id",
): Promise<number | null> {
  try {
    const res = await fetch(
      `${c.url}/rest/v1/${table}?store_id=eq.${enc(storeId)}&${idColumn}=eq.${enc(staffId)}&select=store_id`,
      {
        method: "DELETE",
        headers: { ...authHeaders(c), Prefer: "return=representation" },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown;
    return Array.isArray(rows) ? rows.length : 0;
  } catch {
    return null;
  }
}

async function deleteOneStaff(c: Conn, storeId: string, staffId: string) {
  /* 1) 법정 보존 기록이 있으면 아무것도 안 건드린다 */
  const left: string[] = [];
  for (const { table, label } of STAFF_BLOCKERS) {
    const n = await countFor(c, table, storeId, staffId);
    if (n === null) return bad("서버에 연결하지 못했습니다.", 504);
    if (n > 0) left.push(`${label} ${n}건`);
  }
  if (left.length > 0) {
    return Response.json(
      {
        ok: false,
        reason: `이 직원 앞으로 ${left.join(" · ")}이 남아 있어 지우지 않았습니다. 출퇴근·근로계약은 3년 보관해야 하는 기록입니다 (근로기준법 제42조).`,
      },
      { status: 409 },
    );
  }

  /* 2) 배정은 계획이라 같이 지운다. 직원보다 **먼저** — 거꾸로면 FK 가 막는다 */
  for (const table of STAFF_CASCADE) {
    if ((await wipeFor(c, table, storeId, staffId)) === null)
      return bad(`${table} 를 지우지 못했습니다.`, 502);
  }

  /* 3) 직원 줄. 여기서는 열쇠가 `staff_id` 가 아니라 `id` 다 */
  const gone = await wipeFor(c, "staff", storeId, staffId, "id");
  if (gone === null) return bad("직원을 지우지 못했습니다.", 502);
  return Response.json({ ok: true, deleted: gone });
}

export async function DELETE(request: Request, ctx: Ctx) {
  if (!authConfigured()) return bad("not-configured", 409);
  const { table } = await ctx.params;
  if (!isAllowedTable(table)) return bad("unknown-table", 404);

  const { access, who } = await session(request);
  if (who.state !== "ok") return bad(who.state, 401);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return bad("not-configured", 409);

  /* ★ `?id=` 가 붙으면 한 줄만 지운다 (직원 전용) */
  const one = new URL(request.url).searchParams.get("id");
  if (one !== null) {
    if (table !== "staff") return bad("한 줄만 지우는 길은 직원 명단에만 있습니다.");
    if (!UUID_RE.test(one)) return bad("직원 번호가 올바르지 않습니다.");
    return deleteOneStaff({ url, key, access }, who.storeId, one);
  }

  let res: Response;
  try {
    res = await fetch(
      `${url}/rest/v1/${table}?store_id=eq.${encodeURIComponent(who.storeId)}&select=store_id`,
      {
        method: "DELETE",
        headers: {
          apikey: key,
          Authorization: `Bearer ${access}`,
          Accept: "application/json",
          /* 지운 줄을 돌려받아 몇 줄인지 센다 — 화면이 그 숫자를 보여준다 */
          Prefer: "return=representation",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    return bad("서버에 연결하지 못했습니다.", 504);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return bad(`서버가 거절했습니다 (${res.status}). ${detail.slice(0, 200)}`, 502);
  }
  const gone = (await res.json().catch(() => [])) as unknown;
  return Response.json({ ok: true, deleted: Array.isArray(gone) ? gone.length : 0 });
}
