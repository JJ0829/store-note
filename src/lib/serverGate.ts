import crypto from "node:crypto";

/* ------------------------------------------------------------------ *
 * 서버가 거는 매장 잠금.
 *
 * ★ 이것이 `storeGate.ts`(브라우저 PIN)와 다른 점 — **진짜로 막는다.**
 *
 *   브라우저 PIN 은 화면을 가릴 뿐이고, 서버는 잠금과 무관하게 레시피를
 *   그려서 보낸다. `curl` 이나 [페이지 소스 보기] 로 PIN 없이 읽힌다
 *   (실측: `tests/builtPages.test.ts`). 레시피는 영업비밀인데 그렇다.
 *
 *   여기서는 **서버가 쿠키를 확인하고, 없으면 레시피를 아예 안 그린다.**
 *   보낼 것이 없으니 받아갈 것도 없다.
 *
 * ────────────────────────────────────────────────────────────────
 * ⚠️ `STORE_PIN` 을 안 넣고 배포하면 **막지 않는다** (사장님 결정 2026-09-10).
 *
 *   왜 닫지 않는가 — 환경변수를 깜빡한 채 심사 시연에 들어가면 레시피가
 *   통째로 안 열린다. 그게 더 큰 사고다. 대신 **화면이 크게 말한다** —
 *   `ServerStoreGate` 가 빨간 띠를 띄운다. 조용히 열려 있는 것만은 안 한다.
 *
 * ⚠️ 무차별 대입은 **완전히는 못 막는다.** 4자리면 후보가 10,000개다.
 *   아래에 시도 제한을 두지만 서버가 여러 개로 늘어나면(서버리스) 각자
 *   따로 센다. **그래서 PIN 을 6자리 이상으로 잡는 게 낫다** —
 *   `.env.example` 에 그렇게 적어뒀다.
 * ------------------------------------------------------------------ */

/** 쿠키 이름. httpOnly 라 브라우저 스크립트로는 못 읽는다 */
export const STORE_COOKIE = "sn_store";

/** 쿠키에 담는 값. PIN 자체가 아니라 요약값이다 — 쿠키는 사람이 볼 수 있다 */
export function cookieValue(pin: string): string {
  return crypto.createHash("sha256").update(`store-note:${pin}`).digest("hex");
}

/** 서버에 매장 PIN 이 설정돼 있는가 */
export function storePinConfigured(): boolean {
  return (process.env.STORE_PIN ?? "").length > 0;
}

/**
 * 쿠키가 지금 설정된 PIN 과 맞는가.
 *
 * ★ `===` 로 비교하지 않는다. 문자열 비교는 앞에서부터 다르면 바로 끝나서,
 *   **맞은 글자 수만큼 시간이 더 걸린다.** 그 시간차로 한 글자씩 알아낼 수
 *   있다(타이밍 공격). 길이가 다르면 비교 자체를 건너뛴다 —
 *   `timingSafeEqual` 이 길이가 다르면 던지기 때문이다.
 */
export function cookieMatches(value: string | undefined): boolean {
  const pin = process.env.STORE_PIN ?? "";
  if (!pin || !value) return false;
  const want = Buffer.from(cookieValue(pin), "utf-8");
  const got = Buffer.from(value, "utf-8");
  if (want.length !== got.length) return false;
  return crypto.timingSafeEqual(want, got);
}

/** 들어온 PIN 이 맞는가 */
export function pinMatches(pin: unknown): boolean {
  const want = process.env.STORE_PIN ?? "";
  if (!want || typeof pin !== "string" || pin.length === 0) return false;
  const a = Buffer.from(want, "utf-8");
  const b = Buffer.from(pin, "utf-8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ *
 * 시도 제한
 *
 * ⚠️ **메모리에 센다.** 서버가 여러 개면 각자 따로 세고, 다시 뜨면 0 이 된다.
 *   그래서 이건 "느리게 만드는 것" 이지 "막는 것" 이 아니다.
 *   제대로 하려면 저장소가 있어야 한다 — Supabase 붙일 때 같이 본다.
 * ------------------------------------------------------------------ */

const TRIES = new Map<string, { n: number; until: number }>();

/** 이 정도 틀리면 잠시 쉬게 한다 */
const FREE_TRIES = 5;
/** 그 뒤로는 한 번 틀릴 때마다 이만큼씩 (밀리초) */
const PENALTY_MS = 2_000;
/** 아무리 틀려도 이 이상은 안 기다리게 한다 */
const MAX_WAIT_MS = 60_000;

/** 지금 시도해도 되는가. 안 되면 몇 밀리초 남았는지 돌려준다 */
export function throttleCheck(who: string, now = Date.now()): number {
  const rec = TRIES.get(who);
  if (!rec) return 0;
  return rec.until > now ? rec.until - now : 0;
}

export function noteFailure(who: string, now = Date.now()): void {
  const rec = TRIES.get(who) ?? { n: 0, until: 0 };
  rec.n += 1;
  const over = Math.max(0, rec.n - FREE_TRIES);
  rec.until = now + Math.min(over * PENALTY_MS, MAX_WAIT_MS);
  TRIES.set(who, rec);
}

export function noteSuccess(who: string): void {
  TRIES.delete(who);
}

/** 테스트용 — 센 것을 비운다 */
export function resetThrottle(): void {
  TRIES.clear();
}
