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
 *
 * ────────────────────────────────────────────────────────────────
 * ★ 2026-09-12 — 쌓는 곳이 둘이 됐다 (D-002 예외 조항)
 *
 *   환경변수가 있으면 **서버 DB(Supabase)** 에 넣고, 없으면 예전처럼
 *   로컬 파일에 쌓는다. 파일은 배포 환경에서 요청 사이에 보존되지 않으므로
 *   **배포본에서는 DB 가 없으면 한 줄도 안 남는다.**
 *
 *   이것은 기능 추가가 아니라 **검증 인프라 복구**다 — 지표가 0건이면
 *   "신입이 체크리스트만 봐도 선배가 붙는 시간이 준다" 를 확인할 방법이 없다.
 *   운영 데이터(매출 · 시급 · 단가 · 레시피)는 **여전히 브라우저에 있다.**
 *
 *   ⚠️ SDK 를 안 깐다. REST 라 `fetch` 로 된다 —
 *     의존성을 더하면 라이선스 감사까지 같이 고쳐야 한다
 *     (`tests/licenseAudit.test.ts`). Anthropic 호출 때와 같은 판단이다.
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

/**
 * 서버 DB 에 한 줄 넣는다. 못 넣으면 `false` — 절대 던지지 않는다.
 *
 * ★ `Prefer: return=minimal` — 넣은 줄을 **돌려받지 않는다.**
 *   이 표는 익명 읽기 권한이 없으므로, 돌려받으려 하면 읽기가 필요해져서
 *   실패한다. (실측 2026-09-12: 지금 서버는 이 헤더가 없어도 안 돌려주지만,
 *   그건 **서버 기본값에 기대는 것**이다. 명시해 두면 기본값이 바뀌어도 안 깨진다.)
 *
 * ★ 진짜로 걸렸던 것은 이게 아니라 **권한(GRANT)** 이었다.
 *   정책(RLS)만 만들고 `grant insert ... to anon` 을 빠뜨리면
 *   `permission denied` 가 나는데, 아래에서 실패를 삼키므로
 *   **아무 오류도 안 보이고 표만 영원히 비어 있다.**
 *   → `db/migrations/0001_events.sql`
 *
 * ★ 환경변수를 함수 안에서 읽는다. 모듈 바깥에서 읽으면 빌드 시점 값이
 *   박혀서, 배포처에서 값을 넣어도 안 잡히는 일이 생긴다.
 */
async function 서버DB에(record: Record<string, unknown>): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return false;

  const { event, at, ...props } = record;
  try {
    const res = await fetch(`${url}/rest/v1/events`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ event, at, props }),
      // 지표 때문에 화면이 기다리면 안 된다. 못 넣으면 그냥 못 넣는 것이다
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

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

  /* 어디에 쌓였는지도 사실대로 돌려준다. 배포 점검에서 `sink` 가 "file" 이면
     그 배포본은 지표를 잃고 있다는 뜻이다 — 파일이 요청 사이에 안 남는다 */
  let sink: "db" | "file" | "none" = "none";

  if (await 서버DB에(record)) {
    sink = "db";
  } else {
    try {
      const file = path.join(process.cwd(), "data", "events.jsonl");
      await fs.appendFile(file, `${JSON.stringify(record)}\n`, "utf-8");
      sink = "file";
    } catch {
      /* 파일 쓰기가 막힌 환경. 화면은 계속 돌아야 하므로 200 으로 답하되
         stored:false 로 사실을 말한다 — 위 주석 참조 */
    }
  }

  return Response.json({ ok: true, stored: sink !== "none", sink });
}
