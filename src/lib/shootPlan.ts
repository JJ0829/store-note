/* ------------------------------------------------------------------ *
 * 촬영 목록 — 모델 응답을 사람이 볼 수 있는 모양으로 거른다
 *
 * ★ 왜 라우트가 아니라 여기 있나: `next/server` 를 import 하는 파일은
 *   `node --test` 로 못 읽는다. 그리고 이건 **라우팅이 아니라 판단**이다 —
 *   AI 기능에서 제일 위험한 곳은 프롬프트가 아니라 **응답을 받는 자리**다.
 *   테스트로 못 박아야 하는 것이 여기다. → tests/shootPlan.test.ts
 * ------------------------------------------------------------------ */

/** 한 번에 만들 수 있는 최대 항목 수. 넘으면 자른다 */
export const MAX_ITEMS = 24;
/** 입력 길이 제한 — 프롬프트에 긴 글을 밀어 넣는 것을 막는다 */
export const MAX_INPUT = 200;

export type ShootPlanItem = {
  title: string;
  /** 왜 찍어야 하는지 — 기준이 갈리는 지점인지가 핵심이다 */
  why: string;
  /** 먼저 찍어야 하는 것 */
  first: boolean;
};

/**
 * 모델 응답에서 목록을 꺼낸다.
 *
 * ★ **그대로 믿지 않는다.** 코드펜스를 붙이거나 앞뒤에 말을 덧붙이는 경우가 있고,
 *   필드가 빠지거나 타입이 다를 수 있다. 모양이 안 맞는 항목은 통째로 버린다 —
 *   반쯤 맞는 것을 화면에 올리면 사장님이 그걸 믿는다.
 */
export function parseItems(text: string): ShootPlanItem[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const raw = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(raw)) return [];

  const out: ShootPlanItem[] = [];
  for (const it of raw) {
    if (typeof it !== "object" || it === null) continue;
    const o = it as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const why = typeof o.why === "string" ? o.why.trim() : "";
    if (!title) continue;
    out.push({ title: title.slice(0, 80), why: why.slice(0, 200), first: o.first === true });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}
