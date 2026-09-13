/* ------------------------------------------------------------------ *
 * 횟수 제한.
 *
 * ★ 왜 필요한가 — `/api/shoot-plan` 은 **돈이 나가는 유일한 경로**다.
 *   사장님의 Gemini 키로 호출당 최대 2000토큰을 쓴다. 배포하면 주소를
 *   아는 사람이 스크립트로 분당 수백 건을 날릴 수 있고, 청구서로 알게 된다.
 *
 * ★ 왜 IP 별만으로는 부족한가 — **IP 를 바꾸면 그만이다.**
 *   그래서 **전체 상한**을 같이 둔다. 이쪽이 실제로 지갑을 지킨다:
 *   IP 가 몇 개든 한 시간에 나갈 수 있는 호출 수가 정해진다.
 *
 * ⚠️ **메모리에 센다.** 서버가 여러 개로 늘어나면(서버리스) 각자 따로 세고,
 *   다시 뜨면 0 이 된다. 즉 상한이 서버 수만큼 곱해진다.
 *   **진짜 상한은 Google Cloud 콘솔의 예산·할당량에서 걸어야 한다** —
 *   `docs/배포.md` 에 적어뒀다. 여기 있는 것은 사고를 늦추는 장치다.
 * ------------------------------------------------------------------ */

type Window = { count: number; resetAt: number };

const buckets = new Map<string, Window>();

export type RateVerdict =
  | { ok: true }
  | { ok: false; retryAfterSec: number; scope: "per-caller" | "total" };

/**
 * 한 칸 쓴다. 넘치면 얼마나 기다려야 하는지 돌려준다.
 *
 * 창(window)이 지나면 셈이 0 으로 돌아간다 — 정확한 슬라이딩이 아니라
 * 고정 창이다. 지갑을 지키는 데는 이걸로 충분하고, 훨씬 단순하다.
 */
function take(
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): number {
  const w = buckets.get(key);
  if (!w || w.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return 0;
  }
  if (w.count < limit) {
    w.count += 1;
    return 0;
  }
  return Math.ceil((w.resetAt - now) / 1000);
}

/** 되돌린다 — 실제로 돈을 안 쓴 요청(입력이 틀렸다든지)까지 세지 않는다 */
function give(key: string): void {
  const w = buckets.get(key);
  if (w && w.count > 0) w.count -= 1;
}

/** 부르는 쪽 한 명이 한 시간에 쓸 수 있는 수 */
export const PER_CALLER_PER_HOUR = 20;
/** ★ 전체 합계. IP 를 바꿔가며 들어와도 이 선을 못 넘는다 */
export const TOTAL_PER_HOUR = 60;

const HOUR = 60 * 60 * 1000;

/**
 * AI 호출 한 칸.
 *
 * 전체 상한을 **먼저** 본다. 개인 상한을 먼저 보면, 전체가 이미 찼는데도
 * 개인 칸을 써버려서 다음 사람이 억울하게 막힌다.
 */
export function takeAiSlot(caller: string, now = Date.now()): RateVerdict {
  const total = take("__total__", TOTAL_PER_HOUR, HOUR, now);
  if (total > 0) return { ok: false, retryAfterSec: total, scope: "total" };

  const mine = take(`c:${caller}`, PER_CALLER_PER_HOUR, HOUR, now);
  if (mine > 0) {
    give("__total__"); // 개인 상한에 걸렸으면 전체 칸은 안 쓴 것이다
    return { ok: false, retryAfterSec: mine, scope: "per-caller" };
  }
  return { ok: true };
}

/** 돈이 안 나간 요청이었으면 칸을 돌려준다 (입력 오류·키 없음 등) */
export function refundAiSlot(caller: string): void {
  give("__total__");
  give(`c:${caller}`);
}

/** 테스트용 */
export function resetRateLimit(): void {
  buckets.clear();
}
