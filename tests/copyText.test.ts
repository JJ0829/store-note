/* ------------------------------------------------------------------ *
 * 클립보드 복사 3단 폴백.
 *
 * 매장 태블릿은 `http://192.168.x.x:3000` 으로 접속한다. 평문 HTTP라
 * `navigator.clipboard`가 아예 없다. 그래서 이 함수의 정상 경로는
 * 개발자 노트북(localhost)에서만 도는 경로다 — 정작 매장에서 도는 건
 * 폴백 쪽인데, 그쪽은 손으로 확인하기 가장 번거롭다.
 *
 * 브라우저 없이 테스트하는 방법: 이 함수가 쓰는 전역 세 개
 * (navigator / document / window)를 갈아끼우면 된다. jsdom을 깔 필요가 없다.
 * ------------------------------------------------------------------ */

import test from "node:test";
import assert from "node:assert/strict";
import { copyText } from "../src/lib/copyText.ts";

/* --- 전역 갈아끼우기 ------------------------------------------------ */

const originals = new Map<string, PropertyDescriptor | undefined>();

function setGlobal(name: string, value: unknown) {
  if (!originals.has(name)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }
  // navigator는 Node에 이미 게터로 있어서 그냥 대입하면 안 된다
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

function restoreGlobals() {
  for (const [name, desc] of originals) {
    if (desc) Object.defineProperty(globalThis, name, desc);
    else delete (globalThis as unknown as Record<string, unknown>)[name];
  }
  originals.clear();
}

/** 가짜 document. textarea 폴백이 실제로 무엇을 하는지 기록한다. */
function fakeDocument(exec: boolean | (() => boolean)) {
  const log = { created: 0, appended: 0, removed: 0, exec: 0, value: "" };
  setGlobal("document", {
    createElement: () => {
      log.created += 1;
      return {
        value: "",
        style: {} as Record<string, string>,
        setAttribute: () => {},
        select: () => {},
        setSelectionRange: () => {},
      };
    },
    body: {
      appendChild: (n: { value: string }) => {
        log.appended += 1;
        log.value = n.value;
      },
      removeChild: () => {
        log.removed += 1;
      },
    },
    execCommand: () => {
      log.exec += 1;
      return typeof exec === "function" ? exec() : exec;
    },
  });
  return log;
}

/** 가짜 window.prompt */
function fakePrompt(behavior: "ok" | "throw") {
  const log = { calls: 0, label: "", text: "" };
  setGlobal("window", {
    prompt: (label: string, text: string) => {
      log.calls += 1;
      log.label = label;
      log.text = text;
      if (behavior === "throw") throw new Error("prompt blocked");
      return text;
    },
  });
  return log;
}

/* ------------------------------------------------------------------ */

test("1단계: clipboard API가 있으면 그걸로 끝낸다", async (t) => {
  t.after(restoreGlobals);
  let written = "";
  setGlobal("navigator", {
    clipboard: {
      writeText: async (s: string) => {
        written = s;
      },
    },
  });
  const dom = fakeDocument(true);
  fakePrompt("ok");

  assert.equal(await copyText("근무표 본문"), "copied");
  assert.equal(written, "근무표 본문");
  // 폴백까지 내려가면 안 된다 — textarea를 만들지도 않았어야 한다
  assert.equal(dom.created, 0);
});

test("2단계: clipboard가 아예 없으면 textarea + execCommand", async (t) => {
  t.after(restoreGlobals);
  setGlobal("navigator", {}); // 평문 HTTP 태블릿이 이 상태다
  const dom = fakeDocument(true);
  const prompt = fakePrompt("ok");

  assert.equal(await copyText("복사할 내용"), "copied");
  assert.equal(dom.created, 1);
  assert.equal(dom.value, "복사할 내용"); // 텍스트가 실제로 들어갔나
  assert.equal(dom.exec, 1);
  assert.equal(dom.removed, 1); // 화면에 textarea를 남기지 않는다
  assert.equal(prompt.calls, 0);
});

test("2단계: navigator 자체가 없어 TypeError가 나도 폴백으로 넘어간다", async (t) => {
  t.after(restoreGlobals);
  setGlobal("navigator", undefined);
  const dom = fakeDocument(true);

  assert.equal(await copyText("내용"), "copied");
  assert.equal(dom.exec, 1);
});

test("2단계: clipboard가 권한 거부로 실패해도 폴백으로 넘어간다", async (t) => {
  t.after(restoreGlobals);
  setGlobal("navigator", {
    clipboard: {
      writeText: async () => {
        throw new Error("NotAllowedError");
      },
    },
  });
  const dom = fakeDocument(true);

  assert.equal(await copyText("내용"), "copied");
  assert.equal(dom.exec, 1);
});

test("3단계: execCommand까지 실패하면 창을 띄워 손으로 복사하게 한다", async (t) => {
  t.after(restoreGlobals);
  setGlobal("navigator", {});
  const dom = fakeDocument(false); // execCommand가 false를 준다
  const prompt = fakePrompt("ok");

  assert.equal(await copyText("근무표", "이걸 복사하세요"), "manual");
  assert.equal(dom.removed, 1); // 실패해도 textarea는 치운다
  assert.equal(prompt.calls, 1);
  assert.equal(prompt.label, "이걸 복사하세요");
  assert.equal(prompt.text, "근무표");
});

test("3단계: 안내 문구 기본값", async (t) => {
  t.after(restoreGlobals);
  setGlobal("navigator", {});
  fakeDocument(false);
  const prompt = fakePrompt("ok");

  await copyText("내용");
  assert.equal(prompt.label, "아래 내용을 복사하세요");
});

test("execCommand가 예외를 던져도 창까지는 간다", async (t) => {
  t.after(restoreGlobals);
  setGlobal("navigator", {});
  fakeDocument(() => {
    throw new Error("execCommand not supported");
  });
  const prompt = fakePrompt("ok");

  assert.equal(await copyText("내용"), "manual");
  assert.equal(prompt.calls, 1);
});

test("셋 다 막히면 failed — 그래도 예외를 밖으로 던지지 않는다", async (t) => {
  t.after(restoreGlobals);
  setGlobal("navigator", {});
  fakeDocument(false);
  fakePrompt("throw");

  // 버튼을 눌렀는데 앱이 죽는 것이 제일 나쁘다
  assert.equal(await copyText("내용"), "failed");
});
