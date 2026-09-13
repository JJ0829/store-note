/* ------------------------------------------------------------------ *
 * 로그인 — 서버가 들고 있는 세션.
 *
 * ★ 왜 지금 필요한가 (2026-09-13)
 *
 *   `db/schema_v2.sql` 의 표 37개에는 매장 격리 정책이 걸려 있고,
 *   그 정책은 `current_store_id()` → `auth.uid()`, 즉 **로그인한 사람**에서
 *   매장을 찾는다. **로그인이 없으면 앱이 그 표에 한 줄도 못 넣는다.**
 *   그래서 출퇴근·매출이 여전히 `events`(발자국) 에만 남고 서랍은 비어 있었다.
 *
 *   로그인은 «있으면 좋은 기능» 이 아니라 **이관의 1번**이다.
 *
 * ★ SDK 를 안 깐다. Supabase Auth 도 REST 라 `fetch` 로 된다 —
 *   `mediaStore.ts` · `/api/log` 와 같은 판단이다. 런타임 의존성은 3개 그대로.
 *
 * ★ 토큰은 **httpOnly 쿠키**에 둔다. `localStorage` 에 두면 화면에 끼어든
 *   스크립트가 통째로 들고 나간다. 그 토큰 하나면 매장 데이터 전부가 열린다.
 *   (`/api/store-unlock` 이 이미 같은 방식이다)
 *
 * ⚠️ **비밀번호는 어디에도 저장하지 않는다.** 받아서 Supabase 로 넘기고 버린다.
 *
 * ⚠️ 로그인은 **선택이다.** 환경변수가 없거나 로그인을 안 해도 앱은 지금처럼
 *   전부 `localStorage` 로 돈다. 이 저장소가 계속 지켜온 규율이고
 *   (`STORE_PIN` 없으면 열림 · `SUPABASE_URL` 없으면 파일에 쌓음),
 *   **9/18 시연이 로그인 때문에 막히면 안 된다.**
 * ------------------------------------------------------------------ */

/** 접근 토큰. 짧게 산다 (Supabase 기본 1시간) */
export const AT_COOKIE = "sn_at";
/** 갱신 토큰. 이것으로 접근 토큰을 다시 받는다 */
export const RT_COOKIE = "sn_rt";

function conf(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  return url && key ? { url: url.replace(/\/+$/, ""), key } : null;
}

/** 서버에 Supabase 설정이 있는가. 없으면 로그인 화면을 아예 안 띄운다 */
export function authConfigured(): boolean {
  return conf() !== null;
}

export type Tokens = { access: string; refresh: string; expiresIn: number };

/* ------------------------------------------------------------------ *
 * 토큰 읽기 — 서명을 검사하지 않는다
 *
 * ★ 여기서 JWT 를 **직접 까 보는 것은 «내 id 와 만료 시각» 을 알기 위해서만**이다.
 *   진짜 검사는 Supabase(PostgREST)가 한다 — 위조 토큰을 들고 가면 거기서
 *   거부된다. 그래서 서명 검증 라이브러리를 깔지 않는다.
 *
 * ⚠️ 그러므로 **여기서 읽은 값으로 권한을 판단하면 안 된다.**
 *   화면에 이름을 띄우는 것까지만 쓴다.
 * ------------------------------------------------------------------ */
export function readToken(token: string | undefined): { sub?: string; exp?: number } | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
    const o = JSON.parse(json) as { sub?: unknown; exp?: unknown };
    return {
      sub: typeof o.sub === "string" ? o.sub : undefined,
      exp: typeof o.exp === "number" ? o.exp : undefined,
    };
  } catch {
    return null;
  }
}

/** 만료됐는가. 30초 여유를 둔다 — 보내는 도중에 넘어가는 것을 막는다 */
export function isExpired(token: string | undefined, nowSec = Date.now() / 1000): boolean {
  const t = readToken(token);
  if (!t?.exp) return true;
  return t.exp - 30 <= nowSec;
}

/* ------------------------------------------------------------------ *
 * Supabase Auth
 * ------------------------------------------------------------------ */

async function tokenCall(body: Record<string, string>, query: string): Promise<Tokens | null> {
  const c = conf();
  if (!c) return null;
  try {
    const res = await fetch(`${c.url}/auth/v1/token?${query}`, {
      method: "POST",
      headers: { apikey: c.key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // 로그인 때문에 화면이 오래 멈춰 있으면 안 된다
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!j.access_token || !j.refresh_token) return null;
    return { access: j.access_token, refresh: j.refresh_token, expiresIn: j.expires_in ?? 3600 };
  } catch {
    return null;
  }
}

/** 이메일·비밀번호로 로그인. 실패하면 `null` — 이유는 말하지 않는다 */
export function signIn(email: string, password: string): Promise<Tokens | null> {
  return tokenCall({ email, password }, "grant_type=password");
}

/** 접근 토큰이 만료됐을 때 갱신 토큰으로 새로 받는다 */
export function refreshTokens(refresh: string): Promise<Tokens | null> {
  return tokenCall({ refresh_token: refresh }, "grant_type=refresh_token");
}

/* ------------------------------------------------------------------ *
 * 나는 누구인가
 * ------------------------------------------------------------------ */

export type Who =
  | { state: "anon" }
  /** 로그인은 됐는데 `users` 행이 없다 — 매장에 연결되지 않은 계정 */
  | { state: "no-store"; userId: string }
  | {
      state: "ok";
      userId: string;
      name: string;
      role: string;
      storeId: string;
      storeName: string;
    };

/**
 * 지금 이 토큰이 누구이고 어느 매장인가.
 *
 * ★ `users` 와 `stores` 를 **서버가 직접 물어본다.** 토큰 안의 값을 믿지 않는다 —
 *   RLS 정책이 «자기 매장 줄만» 을 강제하므로, 돌아온 행 자체가 증거다.
 */
export async function whoAmI(access: string | undefined): Promise<Who> {
  const c = conf();
  const sub = readToken(access)?.sub;
  if (!c || !access || !sub) return { state: "anon" };

  const head = {
    apikey: c.key,
    Authorization: `Bearer ${access}`,
    Accept: "application/json",
  };

  try {
    const ures = await fetch(
      `${c.url}/rest/v1/users?select=id,name,role,store_id&id=eq.${encodeURIComponent(sub)}&limit=1`,
      { headers: head, signal: AbortSignal.timeout(8000), cache: "no-store" },
    );
    if (!ures.ok) return { state: "anon" };
    const rows = (await ures.json()) as Array<{
      id: string;
      name: string;
      role: string;
      store_id: string;
    }>;
    const u = rows[0];
    if (!u) return { state: "no-store", userId: sub };

    const sres = await fetch(
      `${c.url}/rest/v1/stores?select=id,name&id=eq.${encodeURIComponent(u.store_id)}&limit=1`,
      { headers: head, signal: AbortSignal.timeout(8000), cache: "no-store" },
    );
    const srows = sres.ok
      ? ((await sres.json()) as Array<{ id: string; name: string }>)
      : [];

    return {
      state: "ok",
      userId: u.id,
      name: u.name,
      role: u.role,
      storeId: u.store_id,
      storeName: srows[0]?.name ?? "(매장 이름 없음)",
    };
  } catch {
    return { state: "anon" };
  }
}

/* ------------------------------------------------------------------ *
 * 쿠키
 * ------------------------------------------------------------------ */

function one(name: string, value: string, maxAge: number): string {
  return [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    /* ★ Lax 로 둔다. 카톡으로 받은 링크를 눌러 들어와도 세션이 살아 있어야 한다 —
       체크리스트가 실제로 그렇게 열린다. Strict 면 첫 진입에서 로그아웃처럼 보인다 */
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");
}

/**
 * 로그인 성공 뒤 붙일 `Set-Cookie` 들.
 *
 * ★ 갱신 토큰을 접근 토큰보다 **오래** 둔다. 그래야 한 시간 뒤에도
 *   다시 로그인하지 않고 이어 쓴다. 매장 태블릿은 하루 종일 켜져 있다.
 */
export function sessionCookies(t: Tokens): string[] {
  return [
    one(AT_COOKIE, t.access, t.expiresIn),
    one(RT_COOKIE, t.refresh, 60 * 60 * 24 * 14),
  ];
}

/** 로그아웃 — 두 쿠키를 즉시 만료시킨다 */
export function clearCookies(): string[] {
  return [one(AT_COOKIE, "", 0), one(RT_COOKIE, "", 0)];
}

/**
 * `Cookie:` 헤더에서 한 칸 꺼낸다.
 *
 * ★ `next/headers` 의 `cookies()` 를 안 쓴다 — 그걸 부르면 이 파일을
 *   **테스트가 그냥 못 불러온다**(Next 실행 맥락이 필요하다).
 *   `/api/store-unlock` 이 같은 이유로 헤더를 직접 읽는다.
 */
export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== name) continue;
    const v = part.slice(i + 1).trim();
    return v.length ? v : undefined;
  }
  return undefined;
}
