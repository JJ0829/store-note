/* 표준 `Response` 를 쓴다. `next/server` 쪽 응답 도우미는 번들러가
   있어야 읽히는데, 그러면 테스트가 이 파일을 그대로 못 부른다.
   하는 일은 같다 (`/api/store-unlock` 도 표준 `Response` 를 쓴다).
   → tests/aiGuard.test.ts */
import { MAX_INPUT, parseItems } from "../../../lib/shootPlan.ts";
/* ★ `@/` 가 아니라 상대경로다 — 테스트가 이 파일을 그대로 불러서 부른다.
   노드는 `@/` 별칭을 모른다. → tests/aiGuard.test.ts */
import {
  refundAiSlot,
  takeAiSlot,
} from "../../../lib/rateLimit.ts";
import {
  STORE_COOKIE,
  cookieMatches,
  storePinConfigured,
} from "../../../lib/serverGate.ts";

/* ------------------------------------------------------------------ *
 * 촬영 목록 만들기 — 이 앱의 유일한 AI 기능
 *
 * ★ 왜 하필 이것인가 (CLAUDE.md 확정 결정)
 *
 *   *"AI의 역할은 텍스트 초안이 아니라 **촬영 목록 생성**이다.
 *     포지션명 넣으면 '이 18개를 찍으세요'가 나오고 폰 들고 한 바퀴."*
 *
 *   이 제품의 핵심 가치 셋은 **사진·영상 / 수정 비용 0 / 기록** 이고,
 *   그중 사진·영상의 병목은 만드는 기술이 아니라 **"사장님이 안 찍는다"** 이다.
 *   무엇을 찍어야 할지 목록이 없으면 폰을 들지 않는다.
 *   AI 가 그 목록을 만들면 **AI 와 촬영이 한 흐름**이 된다.
 *
 *   ⛔ **레시피·체크리스트 본문 초안은 안 만든다** (D-002 유지).
 *      기준이 사람 머릿속에 있다는 게 이 제품이 푸는 문제인데,
 *      그 기준을 AI 가 지어내면 문제를 푸는 게 아니라 바꿔치기하는 것이다.
 *
 * ★ 설계에서 지킨 것
 *
 *   1. **키는 서버에만.** `GEMINI_API_KEY` 는 브라우저에 안 나간다.
 *      `NEXT_PUBLIC_` 접두사를 쓰면 번들에 박히므로 절대 쓰지 않는다.
 *   2. **SDK 를 안 깐다.** REST 라 `fetch` 로 된다.
 *      런타임 의존성 3개(next·react·react-dom)를 유지한다 — CLAUDE.md.
 *   3. **응답을 그대로 믿지 않는다.** 모양을 검사하고 개수를 자른다.
 *   4. **저장하지 않는다.** 만든 목록은 화면에만 있고 사장님이 보고 고른다.
 *      AI 가 만든 것을 앱이 기정사실로 만들지 않는다.
 *   5. **키가 없으면 없다고 말한다.** 규칙 기반 가짜 목록으로 때우지 않는다 —
 *      그러면 AI 가 도는지 아닌지 아무도 모르게 된다.
 *
 * ⚠️ **단일 파일 시연본(`presentation/`)에는 이 기능이 없다.**
 *   그 파일의 규율은 **외부 요청 0건**이다(발표장에서 인터넷이 끊겨도 도는 것).
 *   AI 는 네트워크가 있어야 하므로 둘은 같이 갈 수 없다.
 *
 * ────────────────────────────────────────────────────────────────
 * ★ 돈이 나가는 유일한 경로다 (2026-09-10 에 막았다)
 *
 *   전에는 **인증도 횟수 제한도 없었다.** 배포하면 주소를 아는 사람이
 *   사장님 키로 호출당 2000토큰씩, 얼마든지 쓸 수 있었다. 청구서로 알게 된다.
 *   키를 서버에만 둔 것은 맞았는데 **그 키를 아무나 쓸 수 있다**가 빠져 있었다.
 *
 *   두 겹으로 막는다.
 *     1) `STORE_PIN` 이 설정돼 있으면 **매장 쿠키를 요구한다.**
 *        레시피 화면과 같은 문이다 — 번호를 아는 사람만 쓴다
 *     2) 설정이 없어도 **횟수 제한은 항상 건다.** 사장님 결정("열되 알린다")은
 *        레시피 얘기였고, 이건 돈이라 열어두더라도 상한은 있어야 한다
 *
 *   ⚠️ 둘 다 서버 메모리에 센다. **진짜 상한은 Google AI Studio 쪽 한도**
 *     에서 걸어야 한다 — `docs/배포.md`.
 * ------------------------------------------------------------------ */

/* ★ 2026-09-13 — Anthropic 에서 **Google Gemini** 로 바꿨다.
   바꾼 이유는 값이다: 무료 등급이 있어서 결제 수단 없이 돈다.
   **나가는 것은 포지션·메뉴 이름과 짧은 메모뿐**이라(아래 `user`)
   무료 등급이 입력을 학습에 쓰더라도 샐 영업비밀이 없다 —
   레시피 배합은 이 요청에 실리지 않는다. 그래서 바꿀 수 있었다.

   **모델 이름이 바뀌면 404 가 난다.** 발표장에서 처음 알게 되는 종류라
   `GEMINI_MODEL` 로 덮어쓸 수 있게 뒀다 — 코드를 고치고 다시 배포하지
   않아도 환경변수만 바꾸면 된다. */
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const SYSTEM = `당신은 개인 카페·베이커리의 주방 교육을 돕는다.
사장님이 포지션 이름(예: 오픈조, 제빵, 마감조)이나 메뉴 이름을 주면,
**신입에게 보여줄 사진·영상으로 무엇을 찍어야 하는지** 목록을 만든다.

규칙:
- **기준이 사람마다 갈리는 것**을 먼저 고른다. 글로 적어도 안 통하는 것들이다.
  예) 추출 테스트 합격 기준, 스팀 밀크 거품 상태, 반죽 발효 완료 판단,
      베이커리 잔여 할인/폐기 전환 기준.
  반대로 "앞치마를 입는다" 처럼 글로 충분한 것은 넣지 않는다.
- 한 항목은 **30초 안에 찍을 수 있는 한 장면**이어야 한다.
- "좋은 예 / 나쁜 예"가 갈리는 것이면 why 에 그 점을 적는다.
- 8~16개. 억지로 채우지 않는다.
- 한국어. 매장에서 쓰는 말로. 존댓말은 쓰지 않는다.

반드시 아래 JSON 만 출력한다. 설명·인사·코드펜스를 붙이지 않는다.
{"items":[{"title":"...","why":"...","first":true}]}`;

function bad(reason: string, status = 400) {
  return Response.json({ ok: false, reason }, { status });
}

/** 누구의 호출인지. 정확할 필요는 없고 **나눠서 세기만** 하면 된다 */
function caller(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

/** 쿠키 한 줄에서 매장 쿠키를 꺼낸다 */
function storeCookie(req: Request): string | undefined {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === STORE_COOKIE) return v.join("=");
  }
  return undefined;
}

export async function POST(req: Request) {
  /* ① 매장 번호가 설정돼 있으면 그 문을 지난 사람만 쓴다 */
  if (storePinConfigured() && !cookieMatches(storeCookie(req))) {
    return bad("매장 번호를 먼저 넣어주세요. 레시피 화면에서 넣을 수 있습니다.", 401);
  }

  /* ② 설정이 없어도 횟수 제한은 건다 — 이건 돈이다 */
  const who = caller(req);
  const slot = takeAiSlot(who);
  if (!slot.ok) {
    const mins = Math.ceil(slot.retryAfterSec / 60);
    return bad(
      slot.scope === "total"
        ? `이 서버에서 한 시간에 만들 수 있는 횟수를 다 썼습니다. ${mins}분 뒤에 다시 해주세요.`
        : `너무 여러 번 만들었습니다. ${mins}분 뒤에 다시 해주세요.`,
      429,
    );
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    // 없는 기능을 있는 척하지 않는다. 화면이 이 문장을 그대로 띄운다
    refundAiSlot(who); // 부르지도 못했으니 칸을 돌려준다
    return bad(
      "AI 키가 설정되지 않았습니다. 배포처의 환경변수에 GEMINI_API_KEY 를 넣어주세요.",
      503,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    refundAiSlot(who);
    return bad("요청을 읽을 수 없습니다.");
  }
  const { position, note } = (body ?? {}) as { position?: unknown; note?: unknown };
  const pos = typeof position === "string" ? position.trim().slice(0, MAX_INPUT) : "";
  const memo = typeof note === "string" ? note.trim().slice(0, MAX_INPUT) : "";
  if (pos.length < 2) {
    refundAiSlot(who);
    return bad("포지션이나 메뉴 이름을 2글자 이상 넣어주세요.");
  }

  const user = memo
    ? `포지션·메뉴: ${pos}\n매장 사정: ${memo}`
    : `포지션·메뉴: ${pos}`;

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
      method: "POST",
      /* ★ 키를 **헤더**로 보낸다. 구글 문서는 `?key=` 쿼리도 되지만 그러면
         키가 주소에 실려서 중간의 로그·프록시·브라우저 기록에 남는다.
         헤더는 안 남는다. 하는 일은 같다. */
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 2000 },
      }),
      // 발표장 네트워크가 느릴 수 있다. 무한정 기다리면 화면이 멈춘 것처럼 보인다
      signal: AbortSignal.timeout(30_000),
      },
    );
  } catch {
    return bad("AI 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", 504);
  }

  if (!res.ok) {
    // 키가 틀렸는지 한도인지는 사람에게 다르게 말해야 한다
    /* ★ Gemini 는 키가 틀리면 401 이 아니라 **400/403** 을 준다.
       401 만 보고 있으면 "키가 틀렸다" 를 영영 못 알려주고
       사장님이 엉뚱한 데를 뒤진다. 404 는 모델 이름이다. */
    const hint =
      res.status === 400 || res.status === 401 || res.status === 403
        ? "AI 키가 올바르지 않습니다."
        : res.status === 404
          ? `AI 모델 이름이 올바르지 않습니다 (${MODEL}). 환경변수 GEMINI_MODEL 을 확인해 주세요.`
          : res.status === 429
            ? "AI 사용량 한도에 걸렸습니다. 잠시 뒤 다시 시도해 주세요."
            : `AI 서버가 응답하지 않았습니다 (${res.status}).`;
    return bad(hint, 502);
  }

  let text = "";
  try {
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    /* 첫 후보의 조각들을 잇는다. 안전 필터에 걸리면 `candidates` 가 통째로
       비어 오는데, 그때는 빈 문자열이 되고 아래에서 목록 0개로 걸러진다. */
    text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("");
  } catch {
    return bad("AI 응답을 읽을 수 없습니다.", 502);
  }

  const items = parseItems(text);
  if (items.length === 0) {
    return bad("AI 가 목록을 만들지 못했습니다. 이름을 조금 더 구체적으로 적어보세요.", 502);
  }

  return Response.json({ ok: true, items });
}
