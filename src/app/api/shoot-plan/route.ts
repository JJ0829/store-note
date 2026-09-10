import { NextResponse } from "next/server";
import { MAX_INPUT, parseItems } from "@/lib/shootPlan";

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
 *   1. **키는 서버에만.** `ANTHROPIC_API_KEY` 는 브라우저에 안 나간다.
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
 * ------------------------------------------------------------------ */

const MODEL = "claude-sonnet-5";

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
  return NextResponse.json({ ok: false, reason }, { status });
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    // 없는 기능을 있는 척하지 않는다. 화면이 이 문장을 그대로 띄운다
    return bad(
      "AI 키가 설정되지 않았습니다. 배포처의 환경변수에 ANTHROPIC_API_KEY 를 넣어주세요.",
      503,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("요청을 읽을 수 없습니다.");
  }
  const { position, note } = (body ?? {}) as { position?: unknown; note?: unknown };
  const pos = typeof position === "string" ? position.trim().slice(0, MAX_INPUT) : "";
  const memo = typeof note === "string" ? note.trim().slice(0, MAX_INPUT) : "";
  if (pos.length < 2) return bad("포지션이나 메뉴 이름을 2글자 이상 넣어주세요.");

  const user = memo
    ? `포지션·메뉴: ${pos}\n매장 사정: ${memo}`
    : `포지션·메뉴: ${pos}`;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: "user", content: user }],
      }),
      // 발표장 네트워크가 느릴 수 있다. 무한정 기다리면 화면이 멈춘 것처럼 보인다
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return bad("AI 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", 504);
  }

  if (!res.ok) {
    // 키가 틀렸는지 한도인지는 사람에게 다르게 말해야 한다
    const hint =
      res.status === 401
        ? "AI 키가 올바르지 않습니다."
        : res.status === 429
          ? "AI 사용량 한도에 걸렸습니다. 잠시 뒤 다시 시도해 주세요."
          : `AI 서버가 응답하지 않았습니다 (${res.status}).`;
    return bad(hint, 502);
  }

  let text = "";
  try {
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    text = (data.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
  } catch {
    return bad("AI 응답을 읽을 수 없습니다.", 502);
  }

  const items = parseItems(text);
  if (items.length === 0) {
    return bad("AI 가 목록을 만들지 못했습니다. 이름을 조금 더 구체적으로 적어보세요.", 502);
  }

  return NextResponse.json({ ok: true, items });
}
