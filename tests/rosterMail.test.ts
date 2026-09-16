import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  MAX_RECIPIENTS,
  explainResend,
  mailConfigured,
  mailFrom,
  parseMailRequest,
  sendOne,
  sendViaServer,
} from "../src/lib/rosterMail.ts";

/* ------------------------------------------------------------------ *
 * 근무표 메일을 서버가 보낸다 (Resend · 2026-09-16)
 *
 * ★ 메일은 돈·평판이 든다. 브라우저가 보낸 것을 그대로 믿으면 우리 보낸이로
 *   아무에게나 아무 내용을 쏠 수 있다. 그래서 거르는 쪽을 못 박는다.
 * ------------------------------------------------------------------ */

const good = { to: ["a@b.co"], subject: "근무표", text: "월 07:30~15:30" };

test("★ 받는 사람 — 다듬고, 겹치는 것을 지우고, 모양이 아니면 누구인지 말한다", () => {
  assert.equal(parseMailRequest(null).ok, false);
  assert.equal(parseMailRequest({ ...good, to: [] }).ok, false);
  assert.equal(parseMailRequest({ ...good, to: "a@b.co" }).ok, false, "배열이 아니면 안 된다");

  const r = parseMailRequest({ ...good, to: [" A@B.co ", "a@b.co", "", 3, null] });
  assert.ok(r.ok);
  assert.deepEqual(r.ok && r.req.to, ["a@b.co"]);

  const bad = parseMailRequest({ ...good, to: ["a@b.co", "not-mail"] });
  assert.ok(!bad.ok && bad.reason.includes("not-mail"), "어느 주소가 문제인지 말해야 한다");

  const many = parseMailRequest({
    ...good,
    to: Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `u${i}@x.co`),
  });
  assert.equal(many.ok, false);
});

test("★ 제목에 줄바꿈이 있으면 거절한다 — 메일 머리말이 갈라진다 (헤더 주입)", () => {
  assert.equal(parseMailRequest({ ...good, subject: "근무표\nBcc: x@y.z" }).ok, false);
  assert.equal(parseMailRequest({ ...good, subject: "근무\r\n표" }).ok, false);
  /* 끝의 줄바꿈은 다듬으면서 사라지므로 통과한다 — 주입이 아니다 */
  assert.equal(parseMailRequest({ ...good, subject: "근무표\r\n" }).ok, true);
});

test("제목·본문이 비면 거절하고, 다듬은 값을 돌려준다", () => {
  assert.equal(parseMailRequest({ ...good, subject: "  " }).ok, false);
  assert.equal(parseMailRequest({ ...good, text: "" }).ok, false);
  assert.equal(parseMailRequest({ ...good, text: "x".repeat(20_001) }).ok, false);
  const r = parseMailRequest({ ...good, subject: "  근무표  ", text: "  본문  " });
  assert.ok(r.ok && r.req.subject === "근무표" && r.req.text === "본문");
});

test("★ Resend 403 「본인 주소로만」 은 키 오류가 아니라 도메인 인증 문제라고 말한다", () => {
  /* 가입 직후 가장 흔한 오류. 「키가 틀렸다」 로 읽으면 키를 다시 만드느라 시간을 버린다 */
  const m = explainResend(
    403,
    JSON.stringify({
      statusCode: 403,
      message: "You can only send testing emails to your own email address (you@x.com).",
    }),
  );
  assert.ok(m.includes("도메인"), m);
  assert.ok(explainResend(401, "").includes("키"));
  assert.ok(explainResend(429, "").includes("잠시"));
  assert.ok(explainResend(422, JSON.stringify({ message: "Invalid `from`" })).includes("Invalid"));
  assert.ok(explainResend(500, "not json").includes("500"));
});

test("sendOne — Resend 에 한 사람씩 보내고 성공/실패를 그대로 돌려준다 (가짜 fetch)", async () => {
  const calls: Array<[string, RequestInit]> = [];
  const okFetch = (async (url: unknown, init: unknown) => {
    calls.push([String(url), init as RequestInit]);
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  assert.deepEqual(await sendOne("re_key", "f@x.co", "t@x.co", "제목", "본문", okFetch), { ok: true });
  const [url, init] = calls[0];
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal((init.headers as Record<string, string>).Authorization, "Bearer re_key");
  const sent = JSON.parse(init.body as string) as { from: string; to: string[]; subject: string; text: string };
  assert.deepEqual(sent, { from: "f@x.co", to: ["t@x.co"], subject: "제목", text: "본문" });

  const failFetch = (async () =>
    new Response(JSON.stringify({ message: "Invalid `to`" }), { status: 422 })) as typeof fetch;
  const r = await sendOne("k", "f@x.co", "t@x.co", "s", "b", failFetch);
  assert.ok(!r.ok && r.reason.includes("거절"));

  const downFetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as typeof fetch;
  const d = await sendOne("k", "f@x.co", "t@x.co", "s", "b", downFetch);
  assert.ok(!d.ok && d.reason.includes("연결"));
});

test("★ 설정이 없으면 not-configured — 화면은 예전 길(메일 앱)로 간다. 데모데이에 버튼이 죽으면 안 된다", async () => {
  const f = (async () =>
    Response.json({ ok: false, reason: "not-configured" }, { status: 409 })) as typeof fetch;
  assert.deepEqual(await sendViaServer(good, f), { kind: "not-configured" });

  const src = fs.readFileSync(path.join(process.cwd(), "src/components/RosterView.tsx"), "utf-8");
  const a = src.indexOf("sendViaServer(");
  const b = src.indexOf("mailto:?bcc");
  assert.ok(a > 0 && b > a, "서버 길을 먼저 시도하고, 없을 때 메일 앱을 열어야 한다");
  /* 결과를 삼키지 않는다 — 몇 명 갔고 누가 왜 못 받았는지 화면에 쓴다 */
  assert.ok(src.includes("mailState.failed") && src.includes("mailState.reason"));
});

test("★ 낡은 토큰이면 /api/auth/me 를 한 번 거쳐 다시 온다 — 갱신은 그곳에서만 한다", async () => {
  const urls: string[] = [];
  let tries = 0;
  const f = (async (url: unknown) => {
    urls.push(String(url));
    if (String(url) === "/api/auth/me") return new Response("{}");
    tries += 1;
    return tries === 1
      ? Response.json({ ok: false, reason: "stale" }, { status: 401 })
      : Response.json({ ok: true, sent: ["a@b.co"], failed: [] });
  }) as typeof fetch;
  assert.deepEqual(await sendViaServer(good, f), { kind: "sent", sent: ["a@b.co"], failed: [] });
  assert.deepEqual(urls, ["/api/roster-mail", "/api/auth/me", "/api/roster-mail"]);
});

test("서버가 로그인·시도 제한으로 막으면 사람 말로 돌려준다", async () => {
  const login = (async () => Response.json({ ok: false, reason: "login" }, { status: 401 })) as typeof fetch;
  const r1 = await sendViaServer(good, login);
  assert.ok(r1.kind === "error" && r1.reason.includes("로그인"));

  const many = (async () =>
    Response.json({ ok: false, reason: "too-many", waitSec: 312 }, { status: 429 })) as typeof fetch;
  const r2 = await sendViaServer(good, many);
  assert.ok(r2.kind === "error" && r2.reason.includes("312초"));

  /* 일부만 갔으면 ok:false 여도 «보냈다» 로 돌려준다 — 누가 못 받았는지가 본문이다 */
  const part = (async () =>
    Response.json({ ok: false, sent: ["a@b.co"], failed: [{ to: "b@b.co", reason: "x" }] }, { status: 200 })) as typeof fetch;
  const r3 = await sendViaServer(good, part);
  assert.deepEqual(r3, { kind: "sent", sent: ["a@b.co"], failed: [{ to: "b@b.co", reason: "x" }] });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

test("★ 키는 서버에만 — NEXT_PUBLIC_RESEND 가 어디에도 없고, RESEND_API_KEY 는 두 파일만 읽는다", () => {
  const root = process.cwd();
  const files = walk(path.join(root, "src"));
  const readers: string[] = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf-8");
    assert.ok(!src.includes("NEXT_PUBLIC_RESEND"), `${f} 가 키를 브라우저에 싣는다`);
    if (src.includes("RESEND_API_KEY")) readers.push(path.relative(root, f).replace(/\\/g, "/"));
  }
  assert.deepEqual(readers.sort(), ["src/app/api/roster-mail/route.ts", "src/lib/rosterMail.ts"]);
});

test("★ 라우트 — 설정 없으면 409, 로그인이 설정된 배포에서는 사장님만, 시도 제한이 있다", () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/roster-mail/route.ts"),
    "utf-8",
  );
  assert.ok(route.includes('"not-configured"'));
  assert.ok(route.includes("authConfigured()") && route.includes("whoAmI("));
  assert.ok(route.includes('"too-many"'));
  /* 갱신은 /api/auth/me 한 곳에서만 — 여기서 refreshTokens 를 부르면 세션이 끊긴다 */
  assert.ok(!route.includes("refreshTokens"), "이 라우트가 토큰을 갱신하면 안 된다");
});

test("mailConfigured / mailFrom", () => {
  assert.equal(mailConfigured({}), false);
  assert.equal(mailConfigured({ RESEND_API_KEY: "   " }), false);
  assert.equal(mailConfigured({ RESEND_API_KEY: " re_x " }), true);
  assert.ok(mailFrom({}).includes("onboarding@resend.dev"));
  assert.equal(mailFrom({ MAIL_FROM: " 매장수첩 <no-reply@x.co> " }), "매장수첩 <no-reply@x.co>");
});
