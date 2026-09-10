import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

/**
 * 지표 수집용 최소 엔드포인트. 보내는 쪽은 `src/lib/metrics.ts` 하나다.
 *
 * ★ **`stored` 를 사실대로 돌려준다.**
 *   예전에는 파일 쓰기가 실패해도 `{ok:true}` 를 돌려줬다. Vercel 처럼 디스크가
 *   읽기 전용인 곳에 올리면 **한 줄도 안 쌓이는데 클라이언트는 성공으로 안다.**
 *   지표가 0건인 것을 배포하고 한참 뒤에야 알게 되고, 그 사이 데이터는 없다.
 *   그래서 저장 여부를 그대로 말한다 — 배포 점검에서 이 값을 본다.
 *   → `docs/deliverables/01_MVP기획서.md` §8.4 #2
 *
 * ⚠️ 여전히 **인증이 없는 공개 엔드포인트**다. 아래에서 막는 것은
 *   "실수로 커지는 것" 까지다. 진짜 접근 통제는 서버(Supabase)로 가야 한다.
 */

/** 본문 크기 상한. 이벤트 한 건은 200바이트 남짓이다 */
const MAX_BODY = 4 * 1024;

/**
 * 받아들이는 이벤트 이름.
 *
 * 화이트리스트를 두는 이유는 두 가지다. 모르는 이름이 섞이면 (1) 분석할 때
 * 무엇인지 알 수 없고, (2) 공개 엔드포인트라 아무 문자열이나 디스크에 쌓인다.
 * **늘리면 `tests/metrics.test.ts` 의 `EXPECTED` 와 같이 고쳐야 한다.**
 */
const ALLOWED = new Set([
  "view",
  "check",
  "training_start",
  "critical_confirm",
  "training_complete",
  "survey",
  "prep_view",
  "prep_check",
  "prep_scale",
  "recipe_view",
  "recipe_scale",
  "punch",
  "sales_close",
  "order_mark",
  "backup",
]);

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) {
    return Response.json({ ok: false, error: "too large" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ ok: false, error: "invalid body" }, { status: 400 });
  }
  if (typeof body.event !== "string" || !ALLOWED.has(body.event)) {
    return Response.json({ ok: false, error: "unknown event" }, { status: 400 });
  }

  const record = { ...body, at: new Date().toISOString() };

  let stored = false;
  try {
    const file = path.join(process.cwd(), "data", "events.jsonl");
    await fs.appendFile(file, `${JSON.stringify(record)}\n`, "utf-8");
    stored = true;
  } catch {
    /* 파일 쓰기가 막힌 환경. 화면은 계속 돌아야 하므로 200 으로 답하되
       stored:false 로 사실을 말한다 — 위 주석 참조 */
  }

  return Response.json({ ok: true, stored });
}
