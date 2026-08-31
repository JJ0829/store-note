import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

/**
 * 지표 수집용 최소 엔드포인트.
 *   event: "view"   — 체크리스트를 열었다
 *   event: "survey" — 다 끝내고 "선배에게 몇 번 물어봤나" 응답
 *
 * 지금은 data/events.jsonl 파일에 한 줄씩 쌓는다.
 * Vercel처럼 파일 쓰기가 막힌 환경에서는 조용히 무시되므로,
 * 실제 배포 때는 이 부분을 Supabase insert로 바꿔야 한다.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const record = { ...body, at: new Date().toISOString() };

  try {
    const file = path.join(process.cwd(), "data", "events.jsonl");
    await fs.appendFile(file, `${JSON.stringify(record)}\n`, "utf-8");
  } catch {
    // 파일 쓰기 실패는 사용자에게 노출하지 않는다
  }

  return Response.json({ ok: true });
}
