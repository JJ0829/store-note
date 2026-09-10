import {
  STORE_COOKIE,
  cookieValue,
  noteFailure,
  noteSuccess,
  pinMatches,
  storePinConfigured,
  throttleCheck,
  /* ★ `@/` 가 아니라 상대경로다.
   *  테스트가 이 파일을 **그대로 불러서** 부른다 (서버를 안 띄운다).
   *  노드는 `@/` 별칭을 모르므로 `src/lib` 이 쓰는 방식과 같이 맞춘다.
   *  → tests/serverGate.test.ts */
} from "../../../lib/serverGate.ts";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * 매장 PIN 을 서버에 확인받고 쿠키를 받는다.
 *
 * 이 쿠키가 있어야 레시피 화면이 내용을 그린다 (`ServerStoreGate`).
 * 쿠키는 **httpOnly** 다 — 브라우저 스크립트가 못 읽으므로, 화면에 끼어든
 * 스크립트가 있어도 쿠키를 훔쳐 나가지는 못한다.
 *
 * ⚠️ 여기서 하는 시도 제한은 **메모리에 센다.** 서버가 여러 개면 각자
 *   따로 센다 — `serverGate.ts` 주석 참조. 느리게 할 뿐 못 막는다.
 * ------------------------------------------------------------------ */

/** 누구의 시도인지. 정확할 필요는 없고 **나눠서 세기만** 하면 된다 */
function who(request: Request): string {
  const h = request.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: Request) {
  if (!storePinConfigured()) {
    /* 서버에 PIN 이 없으면 잠글 것도 없다. 화면이 이미 빨간 띠로 말하고 있다 */
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
  const pin = (body as { pin?: unknown } | null)?.pin;

  if (!pinMatches(pin)) {
    noteFailure(key);
    // 틀린 이유를 자세히 말하지 않는다 (자릿수·앞글자 등이 힌트가 된다)
    return Response.json({ ok: false, reason: "wrong" }, { status: 401 });
  }

  noteSuccess(key);
  const res = Response.json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    [
      `${STORE_COOKIE}=${cookieValue(pin as string)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      // 매장 태블릿은 한 번 열면 하루 종일 쓴다. 12시간이면 한 영업일이 덮인다
      "Max-Age=43200",
      ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
    ].join("; "),
  );
  return res;
}
