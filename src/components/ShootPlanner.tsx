"use client";

import { useState } from "react";
import { copyText } from "@/lib/copyText";
import { BTN, BTN_PRIMARY, INPUT } from "@/components/ui";
import type { ShootPlanItem } from "@/lib/shootPlan";

/* ------------------------------------------------------------------ *
 * 촬영 목록 만들기 (AI)
 *
 * ★ 이 화면이 푸는 문제는 "무엇을 찍을지 모른다" 이다.
 *   사진·영상이 이 제품의 핵심 가치 셋 중 하나인데 실사가 0장인 이유는
 *   찍는 기술이 없어서가 아니라 **목록이 없어서 폰을 안 들기 때문**이다.
 *   → CLAUDE.md "AI 의 역할은 촬영 목록 생성이다"
 *
 * ★ 만든 목록을 **저장하지 않는다.**
 *   AI 가 만든 것을 앱이 기정사실로 만들면, 기준이 사람 머릿속에 있다는
 *   원래 문제를 푸는 게 아니라 **AI 머릿속으로 옮기는 것**이 된다.
 *   사장님이 보고, 고르고, 폰으로 들고 나간다. 복사 버튼이 그 다리다.
 * ------------------------------------------------------------------ */

type State =
  | { k: "idle" }
  | { k: "loading" }
  | { k: "error"; reason: string }
  | { k: "done"; items: ShootPlanItem[]; forWhat: string };

export default function ShootPlanner() {
  const [position, setPosition] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<State>({ k: "idle" });

  async function run() {
    if (position.trim().length < 2) {
      setState({ k: "error", reason: "포지션이나 메뉴 이름을 2글자 이상 넣어주세요." });
      return;
    }
    setState({ k: "loading" });
    try {
      const res = await fetch("/api/shoot-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ position, note }),
      });
      const data = (await res.json()) as
        | { ok: true; items: ShootPlanItem[] }
        | { ok: false; reason: string };
      if (!data.ok) {
        setState({ k: "error", reason: data.reason });
        return;
      }
      setState({ k: "done", items: data.items, forWhat: position.trim() });
    } catch {
      setState({ k: "error", reason: "요청을 보내지 못했습니다. 인터넷 연결을 확인해 주세요." });
    }
  }

  const asText =
    state.k === "done"
      ? `[${state.forWhat}] 찍을 것 ${state.items.length}개\n\n` +
        state.items
          .map((it, i) => `${i + 1}. ${it.first ? "★ " : ""}${it.title}\n   — ${it.why}`)
          .join("\n")
      : "";

  return (
    <section className="mt-8 rounded-2xl border-2 border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-[15px] font-bold">
        무엇을 찍을지 모르겠다면{" "}
        <span className="ml-1 rounded-md bg-zinc-900 px-1.5 py-0.5 align-middle text-[11px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
          AI
        </span>
      </h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        포지션이나 메뉴 이름을 넣으면 <b>찍을 목록</b>을 만들어 줍니다. 복사해서
        폰으로 보내고, 주방 한 바퀴 돌면서 찍으세요.{" "}
        <b>기준이 사람마다 갈리는 것</b>을 먼저 골라 줍니다.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        <input
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void run();
          }}
          placeholder="예: 오픈조 · 제빵 · 아인슈페너"
          aria-label="포지션 또는 메뉴 이름"
          className={INPUT}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="매장 사정 (선택) — 예: 사워도우는 안 합니다"
          aria-label="매장 사정 (선택) — 직원 이름·연락처는 쓰지 마세요"
          className={INPUT}
        />
        {/* ★ 제31조 제1항 — 생성형 AI 기반 운용 사실 **사전** 고지.
            누르기 전에 보여야 하므로 버튼 위에 둔다.
            → 05_AI기본법_검토.md §6.2 (1) · §6.3
            ⚠️ 문서 초안은 "포지션명만 전송" 이었으나 **매장 사정 칸도 같이 간다.**
               사실과 다른 고지는 안 하느니만 못하므로 두 칸이라고 적었다
            ★ 2026-09-13 — 제공자 이름도 같은 이유로 고쳤다. Anthropic 에서
               **Google Gemini** 로 바꿨는데(`038560c`) 이 문장만 옛 이름으로
               남아 있었다. 국외 이전 대상 사업자를 틀리게 적은 고지다 */}
        <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[12px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-300">
          <b>이 기능은 외부 AI 서비스(Google Gemini)를 씁니다.</b> 위에 적은{" "}
          <b>두 칸(포지션·메뉴 이름, 매장 사정)만</b> 전송되고,{" "}
          <b>직원 이름·연락처·시급·출퇴근·체크 기록은 전송되지 않습니다.</b>{" "}
          그러니 <b>매장 사정 칸에 사람 이름이나 연락처를 쓰지 마세요.</b>
          <br />
          나오는 것은 <b>초안</b>입니다 — 위생·안전 기준의 최종 판단은 AI 가 대신할 수 없습니다.
          이 기능을 안 쓰고 직접 목록을 만들어도 됩니다.
        </p>

        <button
          type="button"
          className={BTN_PRIMARY}
          onClick={() => void run()}
          disabled={state.k === "loading"}
        >
          {state.k === "loading" ? "만드는 중…" : "찍을 목록 만들기"}
        </button>
      </div>

      {state.k === "error" && (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-[13px] font-semibold leading-relaxed text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.reason}
        </p>
      )}

      {state.k === "done" && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-bold">
              {/* 제31조 제2항 — 생성물 표시. 면제 해석에 기대지 않는다 (§6.2 (2)) */}
              <span className="mr-1.5 rounded-md bg-zinc-900 px-1.5 py-0.5 align-middle text-[10.5px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
                AI 생성 초안
              </span>
              {state.forWhat} — {state.items.length}개
            </p>
            <button
              type="button"
              className={BTN}
              onClick={() => void copyText(asText, "아래 목록을 복사해 폰으로 보내세요")}
            >
              📋 목록 복사
            </button>
          </div>

          <ol className="mt-2.5 flex flex-col gap-2">
            {state.items.map((it, i) => (
              <li
                key={`${i}-${it.title}`}
                className={[
                  "flex items-start gap-2.5 rounded-xl border p-3",
                  it.first
                    ? "border-orange-300 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30"
                    : "border-zinc-200 dark:border-zinc-800",
                ].join(" ")}
              >
                <span
                  aria-hidden
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[12px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold leading-snug">
                    {it.first && (
                      <span className="mr-1.5 rounded-md bg-orange-200 px-1.5 py-0.5 text-[11px] font-bold text-orange-900 dark:bg-orange-900 dark:text-orange-100">
                        먼저
                      </span>
                    )}
                    {it.title}
                  </span>
                  {it.why && (
                    <span className="mt-0.5 block text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                      {it.why}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>

          {/* ★ AI 가 만든 것을 앱이 기정사실로 만들지 않는다 */}
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <b>이 목록은 저장되지 않습니다.</b> AI 가 만든 제안이라 <b>사장님이 보고
            고르는 것</b>이 먼저입니다 — 16년 하신 분이 아는 것을 AI 는 모릅니다.
            우리 매장에 없는 것은 빼고, 빠진 것은 더하세요.
          </p>
        </div>
      )}
    </section>
  );
}
