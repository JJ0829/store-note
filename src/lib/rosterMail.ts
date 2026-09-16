/* ------------------------------------------------------------------ *
 * 근무표 메일 — 서버가 대신 보낸다 (Resend · 2026-09-16)
 *
 * ★ 왜 서버가 보내나
 *   `mailto:` 는 메일 앱을 **열기만** 한다. 사장님이 본문을 붙여넣고 「보내기」를
 *   또 눌러야 하고, 매장 태블릿에는 메일 앱이 없는 경우가 많다. 서버가 보내면
 *   버튼 하나로 끝난다. (2026-09-15 「아무 작동 안 하노」 의 뒤처리)
 *
 * ★ 설정이 없으면 예전 길로 간다
 *   `RESEND_API_KEY` 가 없으면 서버가 409 `not-configured` 를 돌려주고, 화면은
 *   그대로 메일 앱을 연다. **9/18 데모데이에 키가 없어도 버튼이 죽으면 안 된다.**
 *
 * ★ 키는 서버에만. `NEXT_PUBLIC_` 을 붙이면 브라우저 파일에 박혀서 누구나
 *   우리 이름으로 메일을 보낼 수 있다. `tests/rosterMail.test.ts` 가 본다.
 *
 * ★ 한 사람에게 한 통씩 보낸다
 *   숨은참조(bcc)로 묶으면 주소 하나가 잘못돼도 **전부** 실패하고 누가 못 받았는지
 *   모른다. 한 통씩이면 «3명 보냄 · 1명 실패(이유)» 를 그대로 말할 수 있다.
 *   직원끼리 서로 주소를 못 보는 것도 저절로 된다.
 *
 * ★ 직원 이메일이 Resend 라는 **바깥 서비스**로 나간다. 화면 문구에 적어 둔다.
 *
 * ★ Resend 무료 가입 직후에는 **도메인 인증 전이라 가입한 본인 주소로만** 보낼 수
 *   있다 (403). 그 오류는 사람 말로 바꿔 띄운다 — 「키가 틀렸다」 로 오해하기 쉽다.
 * ------------------------------------------------------------------ */

export const MAX_RECIPIENTS = 50;
export const MAX_SUBJECT = 200;
export const MAX_TEXT = 20_000;

/** 느슨한 검사다 — 진짜 판정은 메일 서버가 한다. 여기서는 «주소 모양» 만 본다 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type MailRequest = { to: string[]; subject: string; text: string };
export type Parsed = { ok: true; req: MailRequest } | { ok: false; reason: string };

type Env = Record<string, string | undefined>;

export function mailConfigured(env: Env = process.env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim());
}

/**
 * 보낸이. 도메인을 인증하기 전에는 Resend 가 준 `onboarding@resend.dev` 만 된다.
 * 인증한 뒤 `MAIL_FROM="매장수첩 <no-reply@내도메인>"` 으로 바꾼다 (`docs/배포.md`).
 */
export function mailFrom(env: Env = process.env): string {
  return env.MAIL_FROM?.trim() || "매장수첩 <onboarding@resend.dev>";
}

/** 브라우저가 보낸 것을 믿지 않는다 — 여기서 걸러서 **이유를 말한다** */
export function parseMailRequest(body: unknown): Parsed {
  if (!body || typeof body !== "object") return { ok: false, reason: "요청을 읽을 수 없습니다." };
  const b = body as { to?: unknown; subject?: unknown; text?: unknown };

  const raw = Array.isArray(b.to) ? b.to : [];
  const to = [
    ...new Set(
      raw
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().toLowerCase())
        .filter((x) => x !== ""),
    ),
  ];
  if (to.length === 0) return { ok: false, reason: "받는 사람이 없습니다." };
  if (to.length > MAX_RECIPIENTS) {
    return { ok: false, reason: `받는 사람이 너무 많습니다 (${MAX_RECIPIENTS}명까지).` };
  }
  const bad = to.filter((e) => !EMAIL.test(e));
  if (bad.length > 0) return { ok: false, reason: `이메일 모양이 아닙니다: ${bad.join(", ")}` };

  const subject = typeof b.subject === "string" ? b.subject.trim() : "";
  if (subject === "") return { ok: false, reason: "제목이 없습니다." };
  /* 제목에 줄바꿈이 들어가면 메일 머리말이 갈라진다 (헤더 주입) */
  if (/[\r\n]/.test(subject)) return { ok: false, reason: "제목에 줄바꿈이 있습니다." };
  if (subject.length > MAX_SUBJECT) return { ok: false, reason: "제목이 너무 깁니다." };

  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (text === "") return { ok: false, reason: "본문이 없습니다." };
  if (text.length > MAX_TEXT) return { ok: false, reason: "본문이 너무 깁니다." };

  return { ok: true, req: { to, subject, text } };
}

/* ------------------------------------------------------------------ *
 * Resend 부르기 (서버에서만)
 * ------------------------------------------------------------------ */

export const RESEND_URL = "https://api.resend.com/emails";

/** Resend 의 오류를 사람 말로. 403 「본인 주소로만」 이 가장 흔하고 가장 헷갈린다 */
export function explainResend(status: number, body: string): string {
  let message = "";
  try {
    const j = JSON.parse(body) as { message?: unknown };
    if (typeof j.message === "string") message = j.message;
  } catch {
    message = body.slice(0, 200);
  }
  if (status === 403 && /own email|testing email|verify a domain/i.test(message)) {
    return "Resend 에 도메인을 아직 인증하지 않아, 가입한 본인 주소로만 보낼 수 있습니다. (resend.com → Domains)";
  }
  if (status === 401 || status === 403) return "Resend 키가 틀렸거나 권한이 없습니다.";
  if (status === 422) return `Resend 가 주소나 보낸이를 거절했습니다${message ? `: ${message}` : "."}`;
  if (status === 429) return "Resend 가 잠시 막았습니다 (분당 한도). 잠시 뒤 다시 눌러 주세요.";
  return `Resend 오류 (${status})${message ? `: ${message}` : ""}`;
}

export type OneResult = { ok: true } | { ok: false; reason: string };

export async function sendOne(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  text: string,
  fetchFn: typeof fetch = fetch,
): Promise<OneResult> {
  let res: Response;
  try {
    res = await fetchFn(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, reason: "메일 서버에 연결하지 못했습니다." };
  }
  if (res.ok) return { ok: true };
  const body = await res.text().catch(() => "");
  return { ok: false, reason: explainResend(res.status, body) };
}

/* ------------------------------------------------------------------ *
 * 화면이 부르는 쪽 (브라우저)
 * ------------------------------------------------------------------ */

export type Failed = { to: string; reason: string };

export type ServerMail =
  /** 서버가 보냈다. `failed` 가 비어 있지 않으면 일부만 갔다 */
  | { kind: "sent"; sent: string[]; failed: Failed[] }
  /** 서버 메일이 설정돼 있지 않다 → 화면은 예전 길(메일 앱)로 간다 */
  | { kind: "not-configured" }
  | { kind: "error"; reason: string };

/** 서버 응답 코드 → 사람 말. 화면이 그대로 띄운다 */
export function explainServer(reason: string, status: number, waitSec?: number): string {
  if (reason === "login") return "로그인해야 메일을 보낼 수 있습니다 (사장님 계정).";
  if (reason === "too-many") {
    return `너무 자주 눌렀습니다. ${waitSec ?? 60}초 뒤에 다시 눌러 주세요.`;
  }
  if (reason) return reason;
  return `보내지 못했습니다 (${status}).`;
}

export async function sendViaServer(
  req: MailRequest,
  fetchFn: typeof fetch = fetch,
  retry = true,
): Promise<ServerMail> {
  let res: Response;
  try {
    res = await fetchFn("/api/roster-mail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch {
    return { kind: "error", reason: "서버에 연결하지 못했습니다." };
  }
  const body = (await res.json().catch(() => null)) as
    | { ok?: boolean; sent?: string[]; failed?: Failed[]; reason?: string; waitSec?: number }
    | null;
  const reason = body?.reason ?? "";

  if (res.status === 409 && reason === "not-configured") return { kind: "not-configured" };
  /* 토큰만 낡았다 — `/api/auth/me` 가 갱신하는 유일한 곳이다. 한 번만 다시 */
  if (reason === "stale" && retry) {
    await fetchFn("/api/auth/me", { cache: "no-store" }).catch(() => null);
    return sendViaServer(req, fetchFn, false);
  }
  if (res.ok && body && Array.isArray(body.sent)) {
    return { kind: "sent", sent: body.sent, failed: Array.isArray(body.failed) ? body.failed : [] };
  }
  return { kind: "error", reason: explainServer(reason, res.status, body?.waitSec) };
}
