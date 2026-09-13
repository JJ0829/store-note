/* ------------------------------------------------------------------ *
 * AI 호출을 아무나 못 하게.
 *
 * ★ `/api/shoot-plan` 은 이 앱에서 **돈이 나가는 유일한 경로**다.
 *   사장님의 Anthropic 키로 호출당 최대 2000토큰을 쓴다.
 *
 *   2026-09-10 까지 **인증도 횟수 제한도 없었다.** 배포하면 주소를 아는
 *   사람이 스크립트로 분당 수백 건을 날릴 수 있었고, 청구서로 알게 된다.
 *   키를 서버에만 둔 것은 맞았는데 **그 키를 아무나 쓸 수 있다**가 빠져 있었다.
 *
 *   여기서 못 박는 것 —
 *     · 매장 번호가 설정돼 있으면 **쿠키 없이는 못 부른다**
 *     · 설정이 없어도 **횟수 제한은 걸린다** (열어두더라도 상한은 있어야 한다)
 *     · IP 를 바꿔도 **전체 상한**에 걸린다 (이쪽이 실제로 지갑을 지킨다)
 *     · 돈이 안 나간 실패는 칸을 도로 돌려준다
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import {
  PER_CALLER_PER_HOUR,
  TOTAL_PER_HOUR,
  refundAiSlot,
  resetRateLimit,
  takeAiSlot,
} from "../src/lib/rateLimit.ts";
import { STORE_COOKIE, cookieValue } from "../src/lib/serverGate.ts";

/* ---------- 셈 자체 ---------- */

test("한 사람이 정해진 수만큼 쓰면 막힌다", () => {
  resetRateLimit();
  for (let i = 0; i < PER_CALLER_PER_HOUR; i++) {
    assert.equal(takeAiSlot("1.1.1.1").ok, true, `${i + 1}번째가 막혔다`);
  }
  const over = takeAiSlot("1.1.1.1");
  assert.equal(over.ok, false);
  if (!over.ok) {
    assert.equal(over.scope, "per-caller");
    assert.ok(over.retryAfterSec > 0);
  }
});

test("★ IP 를 바꿔도 전체 상한에 걸린다 (이게 실제로 지갑을 지킨다)", () => {
  resetRateLimit();
  // 한 명씩 조금만 쓰면서 IP 를 계속 바꾼다 — 개인 상한에는 안 걸린다
  let used = 0;
  for (let ip = 0; ip < 200; ip++) {
    if (takeAiSlot(`10.0.0.${ip}`).ok) used += 1;
    else break;
  }
  assert.equal(
    used,
    TOTAL_PER_HOUR,
    "IP 를 바꾸면 얼마든지 쓸 수 있다 — 전체 상한이 안 걸린다",
  );
});

test("전체 상한에 걸리면 그렇다고 말한다 (개인 탓으로 돌리지 않는다)", () => {
  resetRateLimit();
  for (let i = 0; i < TOTAL_PER_HOUR; i++) takeAiSlot(`10.0.1.${i}`);
  const v = takeAiSlot("10.0.9.9");
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.scope, "total");
});

test("★ 개인 상한에 걸린 요청이 전체 칸을 먹지 않는다", () => {
  resetRateLimit();
  // 한 사람이 자기 상한을 다 쓰고 한 번 더 시도한다
  for (let i = 0; i < PER_CALLER_PER_HOUR + 5; i++) takeAiSlot("2.2.2.2");
  // 다른 사람은 남은 전체 칸을 그대로 쓸 수 있어야 한다
  let ok = 0;
  for (let i = 0; i < TOTAL_PER_HOUR; i++) {
    if (takeAiSlot(`3.3.3.${i}`).ok) ok += 1;
  }
  assert.equal(
    ok,
    TOTAL_PER_HOUR - PER_CALLER_PER_HOUR,
    "한 사람이 헛시도한 것까지 전체 칸에서 빠졌다",
  );
});

test("창이 지나면 다시 쓸 수 있다", () => {
  resetRateLimit();
  const t0 = 1_000_000;
  for (let i = 0; i < PER_CALLER_PER_HOUR; i++) takeAiSlot("4.4.4.4", t0);
  assert.equal(takeAiSlot("4.4.4.4", t0).ok, false);
  // 한 시간 뒤
  assert.equal(takeAiSlot("4.4.4.4", t0 + 60 * 60 * 1000 + 1).ok, true);
});

test("돈이 안 나간 요청은 칸을 돌려받는다", () => {
  resetRateLimit();
  takeAiSlot("5.5.5.5");
  refundAiSlot("5.5.5.5");
  let ok = 0;
  for (let i = 0; i < PER_CALLER_PER_HOUR; i++) {
    if (takeAiSlot("5.5.5.5").ok) ok += 1;
  }
  assert.equal(ok, PER_CALLER_PER_HOUR, "돌려받지 못했다");
});

/* ------------------------------------------------------------------ *
 * 실제 라우트 — 서버를 안 띄우고 POST() 를 그대로 부른다
 * ------------------------------------------------------------------ */

const { POST } = await import("../src/app/api/shoot-plan/route.ts");

function req(body: unknown, opts: { ip?: string; cookie?: string } = {}) {
  const h: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": opts.ip ?? "9.9.9.9",
  };
  if (opts.cookie) h.cookie = opts.cookie;
  return new Request("http://localhost/api/shoot-plan", {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  });
}

async function withEnv<T>(
  env: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const before: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    before[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("★ 매장 번호가 설정돼 있으면 쿠키 없이는 못 부른다", async () => {
  resetRateLimit();
  await withEnv({ STORE_PIN: "135790", GEMINI_API_KEY: "fake-key" }, async () => {
    const res = await POST(req({ position: "오픈조" }));
    assert.equal(res.status, 401);
    const body = (await res.json()) as { reason: string };
    assert.match(body.reason, /매장 번호/);
  });
});

test("★ 틀린 쿠키로도 못 부른다", async () => {
  resetRateLimit();
  await withEnv({ STORE_PIN: "135790", GEMINI_API_KEY: "fake-key" }, async () => {
    const res = await POST(
      req({ position: "오픈조" }, { cookie: `${STORE_COOKIE}=${cookieValue("000000")}` }),
    );
    assert.equal(res.status, 401);
  });
});

test("★ 매장 번호가 없어도 횟수 제한은 걸린다 (열어두더라도 상한은 있다)", async () => {
  resetRateLimit();
  await withEnv({ STORE_PIN: undefined, GEMINI_API_KEY: undefined }, async () => {
    /* 키가 없으므로 실제 호출은 안 나가고 503 이 온다. 그런데 그건 칸을
       돌려받는 경로다 — 상한 자체가 도는지 보려면 칸을 다 써야 한다.
       그래서 여기서는 **입력이 성한 요청**으로 전체 상한까지 밀어붙인다.
       (키가 없으니 돈은 안 나간다 — 상한 동작만 본다) */
    for (let i = 0; i < TOTAL_PER_HOUR; i++) takeAiSlot(`7.0.0.${i}`);
    const res = await POST(req({ position: "오픈조" }, { ip: "7.9.9.9" }));
    assert.equal(res.status, 429, "매장 번호가 없다고 상한까지 없으면 안 된다");
    const body = (await res.json()) as { reason: string };
    assert.match(body.reason, /다시 해주세요/);
  });
});

test("입력이 짧으면 칸을 돌려받는다 (오타로 상한을 깎지 않는다)", async () => {
  resetRateLimit();
  await withEnv({ STORE_PIN: undefined, GEMINI_API_KEY: "fake-key" }, async () => {
    for (let i = 0; i < 5; i++) {
      const res = await POST(req({ position: "가" }, { ip: "8.8.8.8" }));
      assert.equal(res.status, 400);
    }
    // 다섯 번 헛쳤어도 자기 칸은 그대로 남아 있어야 한다
    let ok = 0;
    for (let i = 0; i < PER_CALLER_PER_HOUR; i++) {
      if (takeAiSlot("8.8.8.8").ok) ok += 1;
    }
    assert.equal(ok, PER_CALLER_PER_HOUR, "오타가 상한을 깎았다");
  });
});

test("AI 키가 없으면 그렇다고 말하고 칸도 돌려받는다", async () => {
  resetRateLimit();
  await withEnv({ STORE_PIN: undefined, GEMINI_API_KEY: undefined }, async () => {
    const res = await POST(req({ position: "오픈조" }, { ip: "6.6.6.6" }));
    assert.equal(res.status, 503);
    let ok = 0;
    for (let i = 0; i < PER_CALLER_PER_HOUR; i++) {
      if (takeAiSlot("6.6.6.6").ok) ok += 1;
    }
    assert.equal(ok, PER_CALLER_PER_HOUR);
  });
});
