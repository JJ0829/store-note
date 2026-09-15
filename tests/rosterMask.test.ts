/* ------------------------------------------------------------------ *
 * 근무표 화면의 연락처 가리기 + 메일 보내기.
 *
 * ★ 왜 고쳤나 (2026-09-15 · 사장님 지시)
 *
 *   공용 태블릿이라 연락처를 가리는 것은 맞다. 그런데 예전 방식은
 *   `wfjeongho@gmail.com` → `wf•••••••••••om` 이라 **누구 것인지 알아볼 수가
 *   없었다.** 가리는 목적은 «주소를 통째로 베껴가지 못하게» 지
 *   «못 알아보게» 가 아니다.
 *
 *     이메일 → `@` 뒤는 그대로       (도메인은 몇 개뿐이라 가려도 소용없다)
 *     전화   → `010-****-5678`       (매장에서 사람을 가리는 건 뒤 4자리다)
 *
 * ★ 그리고 「메일로 보내기」가 **아무 작동도 안 했다.**
 *   본문을 `mailto:` 주소에 실었는데, 한글이 URL 인코딩되면서 주소가
 *   2,764자가 됐다. Windows 한계(~2,000자)를 넘으면 **메일 앱이 그냥 안
 *   열린다 — 오류도 없다.** 그래서 본문은 클립보드로 넘긴다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { maskEmail, maskPhone } from "../src/lib/maskContact.ts";

/* ------------------------------------------------------------------ */
/* 이메일                                                              */
/* ------------------------------------------------------------------ */

test("★ 이메일은 @ 뒤를 그대로 보여준다", () => {
  assert.equal(maskEmail("wfjeongho@gmail.com"), "wf•••••••@gmail.com");
  assert.equal(maskEmail("af@naver.com"), "af•••@naver.com");
  assert.equal(maskEmail("ar.lee@daum.net"), "ar••••@daum.net");
});

test("이메일 앞부분은 두 글자만 남긴다 (주소를 통째로 못 베끼게)", () => {
  const m = maskEmail("verylongaddress@example.com");
  assert.ok(m.startsWith("ve"), m);
  assert.ok(!m.includes("verylongaddress"), "앞부분이 그대로 보인다");
  assert.ok(m.endsWith("@example.com"), "도메인은 보여야 한다");
});

test("메일 모양이 아니면 예전 방식으로 가린다", () => {
  /* `@` 가 없는 값이 들어와도 통째로 노출되면 안 된다 */
  const m = maskEmail("그냥글자입니다");
  assert.ok(!m.includes("글자입니"), m);
});

/* ------------------------------------------------------------------ */
/* 전화번호                                                            */
/* ------------------------------------------------------------------ */

test("★ 전화번호는 010-****-5678 모양이다", () => {
  assert.equal(maskPhone("010-1234-5678"), "010-****-5678");
  assert.equal(maskPhone("01098765432"), "010-****-5432");
  assert.equal(maskPhone("010 1234 5678"), "010-****-5678");
});

test("★ 서울 지역번호는 두 자리다 — 021 로 자르면 없는 번호가 된다", () => {
  assert.equal(maskPhone("02-123-4567"), "02-***-4567");
  assert.equal(maskPhone("02-1234-5678"), "02-****-5678");
});

test("★ 가운데는 반드시 가려진다 (뒤 4자리·앞자리만 남는다)", () => {
  for (const p of ["010-1234-5678", "031-777-8888", "01055556666"]) {
    const m = maskPhone(p);
    const digits = p.replace(/\D/g, "");
    const middle = digits.slice(m.startsWith("02") ? 2 : 3, -4);
    assert.ok(middle.length > 0, `검사할 가운데가 없다: ${p}`);
    assert.ok(!m.includes(middle), `가운데가 그대로 보인다: ${p} → ${m}`);
    assert.ok(m.endsWith(digits.slice(-4)), `뒤 4자리가 안 보인다: ${p} → ${m}`);
  }
});

/* ------------------------------------------------------------------ */
/* 메일 보내기                                                          */
/* ------------------------------------------------------------------ */

const 코드 = fs
  .readFileSync(path.join(process.cwd(), "src/components/RosterView.tsx"), "utf-8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("★★ mailto 주소에 본문을 싣지 않는다 (2,000자를 넘으면 안 열린다)", () => {
  const m = /mailto:\?[^`]*/.exec(코드)?.[0] ?? "";
  assert.ok(m.length > 0, "mailto 를 못 찾았다");
  assert.ok(!m.includes("body="), `본문을 주소에 싣고 있다: ${m.slice(0, 120)}`);
  assert.ok(m.includes("bcc="), "받는 사람이 빠졌다");
  assert.ok(m.includes("subject="), "제목이 빠졌다");
});

test("본문은 클립보드로 넘기고, 붙여넣으라고 말한다", () => {
  assert.match(코드, /copyText\(body/, "본문을 복사하지 않는다");
  assert.match(
    fs.readFileSync(path.join(process.cwd(), "src/components/RosterView.tsx"), "utf-8"),
    /붙여넣기/,
    "무엇을 하라는지 화면이 말하지 않는다",
  );
});

test("★ 받는 사람은 숨은참조로 넣는다 (직원끼리 주소가 노출되면 안 된다)", () => {
  assert.ok(!/mailto:\?to=/.test(코드), "to= 로 보내면 서로의 주소가 다 보인다");
  assert.match(코드, /bcc=\$\{encodeURIComponent\(/, "bcc 를 인코딩하지 않는다");
});
