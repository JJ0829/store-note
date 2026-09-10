/* ------------------------------------------------------------------ *
 * 서버가 거는 매장 잠금.
 *
 * ★ 이게 왜 다른가 — **브라우저 PIN 은 화면만 가린다.**
 *   서버는 잠금과 무관하게 레시피를 그려서 보냈고, `curl` 로 읽혔다.
 *   레시피는 영업비밀인데 그랬다 (`06_보안설계` V-19).
 *
 *   여기서는 서버가 쿠키를 보고 **없으면 레시피를 아예 안 그린다.**
 *   보낼 것이 없으니 받아갈 것도 없다.
 *
 * 사장님 결정 (2026-09-10) — `STORE_PIN` 을 안 넣고 배포하면 **막지 않는다.**
 *   환경변수를 깜빡한 채 심사 시연에 들어가서 레시피가 안 열리는 것이 더 큰
 *   사고이기 때문이다. 대신 화면이 빨간 띠로 크게 말한다.
 *   그 "열어두되 알린다" 가 지켜지는지도 여기서 못 박는다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import {
  STORE_COOKIE,
  cookieMatches,
  cookieValue,
  noteFailure,
  noteSuccess,
  pinMatches,
  resetThrottle,
  storePinConfigured,
  throttleCheck,
} from "../src/lib/serverGate.ts";

function withPin<T>(pin: string | undefined, fn: () => T): T {
  const before = process.env.STORE_PIN;
  if (pin === undefined) delete process.env.STORE_PIN;
  else process.env.STORE_PIN = pin;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.STORE_PIN;
    else process.env.STORE_PIN = before;
  }
}

/**
 * 비동기용. `withPin` 은 동기라서 **`finally` 가 await 보다 먼저 돈다** —
 * 환경변수가 원래대로 돌아간 뒤에 본문이 실행돼서 테스트가 엉뚱하게 깨졌다.
 * (2026-09-10 실제로 걸렸다)
 */
async function withPinAsync<T>(
  pin: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const before = process.env.STORE_PIN;
  if (pin === undefined) delete process.env.STORE_PIN;
  else process.env.STORE_PIN = pin;
  try {
    return await fn();
  } finally {
    if (before === undefined) delete process.env.STORE_PIN;
    else process.env.STORE_PIN = before;
  }
}
/* ---------- 설정 여부 ---------- */

test("★ 환경변수가 없으면 '설정 안 됨' 이다 (그러면 화면이 알려야 한다)", () => {
  withPin(undefined, () => assert.equal(storePinConfigured(), false));
  withPin("", () => assert.equal(storePinConfigured(), false));
});

test("환경변수가 있으면 설정된 것이다", () => {
  withPin("135790", () => assert.equal(storePinConfigured(), true));
});

/* ---------- PIN 대조 ---------- */

test("맞는 번호만 통과한다", () => {
  withPin("135790", () => {
    assert.equal(pinMatches("135790"), true);
    assert.equal(pinMatches("135791"), false);
    assert.equal(pinMatches("13579"), false);
    assert.equal(pinMatches(""), false);
  });
});

test("★ 설정이 안 됐으면 어떤 번호도 통과시키지 않는다", () => {
  // 빈 환경변수를 빈 입력과 맞춰서 열어주면 안 된다
  withPin(undefined, () => {
    assert.equal(pinMatches(""), false);
    assert.equal(pinMatches("1234"), false);
  });
});

test("문자열이 아닌 것을 넣어도 안 죽는다", () => {
  withPin("135790", () => {
    assert.equal(pinMatches(undefined), false);
    assert.equal(pinMatches(null), false);
    assert.equal(pinMatches(135790), false);
    assert.equal(pinMatches({ toString: () => "135790" }), false);
  });
});

/* ---------- 쿠키 ---------- */

test("★ 쿠키에 번호 자체를 담지 않는다", () => {
  // 쿠키는 사람이 볼 수 있다. 번호가 그대로 들어 있으면 잠금이 무의미하다
  const v = cookieValue("135790");
  assert.ok(!v.includes("135790"), "쿠키 값에 번호가 그대로 들어 있다");
  assert.match(v, /^[0-9a-f]{64}$/, "sha256 요약값이 아니다");
});

test("맞는 쿠키만 통과한다", () => {
  withPin("135790", () => {
    assert.equal(cookieMatches(cookieValue("135790")), true);
    assert.equal(cookieMatches(cookieValue("999999")), false);
    assert.equal(cookieMatches("아무거나"), false);
    assert.equal(cookieMatches(undefined), false);
  });
});

test("★ 번호를 바꾸면 옛 쿠키가 안 통한다", () => {
  const old = cookieValue("135790");
  withPin("246801", () => {
    assert.equal(cookieMatches(old), false, "번호를 바꿨는데 옛 쿠키가 통한다");
  });
});

/* ---------- 시도 제한 ---------- */

test("몇 번까지는 그냥 통과시킨다 (손이 미끄러진 것까지 벌주지 않는다)", () => {
  resetThrottle();
  for (let i = 0; i < 5; i++) noteFailure("1.2.3.4");
  assert.equal(throttleCheck("1.2.3.4"), 0);
});

test("★ 계속 틀리면 점점 오래 기다리게 한다", () => {
  resetThrottle();
  for (let i = 0; i < 8; i++) noteFailure("1.2.3.4");
  const wait = throttleCheck("1.2.3.4");
  assert.ok(wait > 0, "여덟 번을 틀렸는데 안 기다린다");

  resetThrottle();
  for (let i = 0; i < 20; i++) noteFailure("1.2.3.4");
  assert.ok(throttleCheck("1.2.3.4") > wait, "더 틀려도 안 늘어난다");
});

test("한없이 늘어나지는 않는다 (직원이 영영 못 들어가면 안 된다)", () => {
  resetThrottle();
  for (let i = 0; i < 500; i++) noteFailure("1.2.3.4");
  assert.ok(throttleCheck("1.2.3.4") <= 60_000);
});

test("맞히면 센 것이 지워진다", () => {
  resetThrottle();
  for (let i = 0; i < 10; i++) noteFailure("1.2.3.4");
  noteSuccess("1.2.3.4");
  assert.equal(throttleCheck("1.2.3.4"), 0);
});

test("다른 곳의 시도는 따로 센다 (한 사람이 틀려서 매장 전체가 막히면 안 된다)", () => {
  resetThrottle();
  for (let i = 0; i < 20; i++) noteFailure("1.2.3.4");
  assert.equal(throttleCheck("5.6.7.8"), 0);
});

/* ------------------------------------------------------------------ *
 * API — 실제로 부르는 함수를 그대로 부른다 (서버를 안 띄운다)
 * ------------------------------------------------------------------ */

const { POST } = await import("../src/app/api/store-unlock/route.ts");

function req(body: unknown, ip = "9.9.9.9"): Request {
  return new Request("http://localhost/api/store-unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("★ 맞는 번호를 넣으면 httpOnly 쿠키를 준다", async () => {
  resetThrottle();
  await withPinAsync("135790", async () => {
    const res = await POST(req({ pin: "135790" }));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });

    const setCookie = res.headers.get("set-cookie") ?? "";
    assert.match(setCookie, new RegExp(`^${STORE_COOKIE}=`));
    assert.match(setCookie, /HttpOnly/, "스크립트가 읽을 수 있으면 훔쳐 나간다");
    assert.match(setCookie, /SameSite=Lax/);
    assert.ok(!setCookie.includes("135790"), "쿠키에 번호가 그대로 들어갔다");
  });
});

test("★ 틀린 번호에는 쿠키를 안 준다", async () => {
  resetThrottle();
  await withPinAsync("135790", async () => {
    const res = await POST(req({ pin: "000000" }));
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("set-cookie"), null);
  });
});

test("틀린 이유를 자세히 말하지 않는다 (자릿수·앞글자가 힌트가 된다)", async () => {
  resetThrottle();
  await withPinAsync("135790", async () => {
    const short = (await (await POST(req({ pin: "1" }))).json()) as { reason: string };
    const near = (await (await POST(req({ pin: "135791" }))).json()) as { reason: string };
    assert.equal(short.reason, near.reason, "틀린 방식에 따라 답이 다르다");
  });
});

test("★ 서버에 번호가 없으면 잠글 것도 없다고 답한다 (열어주지도 않는다)", async () => {
  resetThrottle();
  await withPinAsync(undefined, async () => {
    const res = await POST(req({ pin: "아무거나" }));
    assert.equal(res.status, 409);
    assert.equal(res.headers.get("set-cookie"), null);
  });
});

test("★ 여러 번 틀리면 429 로 막는다", async () => {
  resetThrottle();
  await withPinAsync("135790", async () => {
    for (let i = 0; i < 8; i++) await POST(req({ pin: "000000" }, "7.7.7.7"));
    const res = await POST(req({ pin: "000000" }, "7.7.7.7"));
    assert.equal(res.status, 429);
    const body = (await res.json()) as { waitSec: number };
    assert.ok(body.waitSec > 0, "얼마나 기다려야 하는지 안 알려준다");
  });
});

test("깨진 본문에도 안 죽는다", async () => {
  resetThrottle();
  await withPinAsync("135790", async () => {
    const res = await POST(req("{ not json", "8.8.8.8"));
    assert.equal(res.status, 400);
  });
});
