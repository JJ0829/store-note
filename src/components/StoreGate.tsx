"use client";

import { useEffect, useState } from "react";
import { checkPin, hasPin, isUnlocked, resetPin, setPin, unlock } from "@/lib/storeGate";
import { BTN, BTN_PRIMARY, Card, INPUT, Screen } from "@/components/ui";

/* ------------------------------------------------------------------ *
 * 레시피 화면을 감싼다.
 *
 * ★ `OwnerGate`와 헷갈리지 말 것. 막으려는 상대가 다르다.
 *   - OwnerGate  : 같은 매장 **직원**이 매출·시급을 보는 것을 막는다
 *   - StoreGate  : **매장 밖 사람**이 링크로 레시피를 여는 것을 가린다
 *
 * ⚠ "막는다"가 아니라 "가린다"로 적은 것은 일부러다. 레시피는 서버가 HTML에
 *   실어 보내므로 **잠긴 상태에서도 페이지 소스에는 들어 있다.**
 *   → `src/lib/storeGate.ts` 헤더에 실측과 함께 적어뒀다.
 *
 * 그래서 문구가 "사장님 화면입니다"가 아니라 "매장 직원만"이다.
 * 신입이 이 화면을 보고 "나는 못 보는 곳이구나" 하고 물러나면 안 된다 —
 * 레시피는 신입이 가장 많이 여는 화면이다.
 *
 * 처음 쓰는 사람을 가두지 않는다 — 매장 PIN을 아직 안 만들었으면 그냥 열린다.
 * ------------------------------------------------------------------ */

export default function StoreGate({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  // 서버 렌더 때는 localStorage를 못 본다. 판단을 미룬다
  const [state, setState] = useState<"loading" | "open" | "locked">("loading");
  const [pin, setPinInput] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    if (!hasPin()) setState("open");
    else setState(isUnlocked() ? "open" : "locked");
  }, []);

  if (state === "loading") {
    return (
      <Screen title={title}>
        <div className="mt-5 h-40 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-900" />
      </Screen>
    );
  }

  if (state === "open") return <>{children}</>;

  function tryOpen() {
    if (checkPin(pin)) {
      unlock();
      setState("open");
    } else setError("번호가 맞지 않습니다.");
  }

  return (
    <Screen title={title}>
      <Card
        className="mt-5"
        title="매장 직원만 볼 수 있습니다"
        note="매장 번호를 넣어주세요. 선배나 사장님이 알려줍니다."
      >
        <div className="mt-3 flex flex-col gap-2">
          <input
            value={pin}
            onChange={(e) => {
              setPinInput(e.target.value.replace(/\D/g, ""));
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && tryOpen()}
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            placeholder="매장 번호"
            aria-label="매장 번호"
            className={INPUT}
          />
          {error && (
            <p role="alert" className="text-[13px] font-semibold text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <button type="button" className={BTN_PRIMARY} onClick={tryOpen}>
            열기
          </button>
        
          {/* ★ 번호를 잊었을 때 (2026-09-10 · 01_MVP기획서 §10.3 (다) #17)
              현재 번호를 안 묻는다 — 이 잠금은 가림막이라 물어봐야 막지도 못하면서
              잊은 사람만 가둔다. 대신 그 뜻을 화면이 그대로 말한다. */}
          {!forgot ? (
            <button
              type="button"
              onClick={() => {
                setForgot(true);
                setError("");
                setPinInput("");
                setConfirm("");
              }}
              className="mt-3 self-start text-[13px] font-semibold text-zinc-500 underline underline-offset-2 dark:text-zinc-400"
            >
              번호를 잊으셨나요?
            </button>
          ) : (
            <div className="mt-3 rounded-xl border-2 border-zinc-300 p-3 dark:border-zinc-700">
              <p className="text-[13px] font-bold">새 번호로 바꾸기</p>
              <p className="mt-1 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                예전 번호를 묻지 않습니다. 이 잠금은 <b>같은 기기를 쓰는 사람이 실수로
                열어보는 것</b>까지만 막는 가림막이라, 물어봐도 막지 못하고{" "}
                <b>잊은 사람만 갇힙니다</b>. 즉 <b>이 태블릿을 만질 수 있는 사람은
                누구나 새로 정할 수 있습니다.</b>
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                <b>레시피는 안 지웁니다.</b> 직접 넣은 레시피는 이 브라우저에만 있어서, 번호를 잊었다고 함께 지우면 되찾을 방법이 없습니다.
              </p>
              <div className="mt-2.5 flex flex-col gap-2">
                <input
                  value={pin}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  placeholder="새 번호 (4자리 이상)"
                  aria-label="새 잠금번호"
                  className={INPUT}
                />
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  placeholder="한 번 더"
                  aria-label="새 잠금번호 확인"
                  className={INPUT}
                />
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  onClick={() => {
                    if (pin.length < 4) return setError("4자리 이상으로 해주세요.");
                    if (pin !== confirm) return setError("두 번 입력한 번호가 다릅니다.");
                    if (!resetPin(pin)) return setError("이 태블릿에 저장할 수 없습니다.");
                    setError("");
                    setForgot(false);
                    unlock();
                    setState("open");
                  }}
                >
                  새 번호로 바꾸고 들어가기
                </button>
                <button
                  type="button"
                  className={BTN}
                  onClick={() => {
                    setForgot(false);
                    setError("");
                    setPinInput("");
                    setConfirm("");
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-3 rounded-xl bg-zinc-100 px-3 py-2.5 text-[12px] leading-relaxed text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          레시피는 매장 자산이라 화면에 바로 뜨지 않게 해두었습니다.
          체크리스트는 지금처럼 링크로 바로 열립니다.
        </p>
      </Card>
    </Screen>
  );
}

/**
 * 첫 화면에 두는 "매장 번호 걸기" 버튼.
 *
 * 화면 안에 만들 곳이 없으면 아무도 PIN을 만들지 않는다 —
 * `OwnerLockButton`에서 배운 것과 같다.
 */
export function StoreLockButton() {
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [setup, setSetup] = useState(false);
  const [pin, setPinInput] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setReady(true);
    setLocked(hasPin());
  }, []);

  if (!ready) return null;

  if (setup) {
    return (
      <Card
        className="mt-3"
        title="매장 번호 만들기"
        note="숫자 4자리 이상. 레시피 화면이 잠깁니다. ★ 사장님 잠금번호와 달리 이건 직원 모두에게 알려주는 번호입니다."
      >
        <div className="mt-3 flex flex-col gap-2">
          <input
            value={pin}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            placeholder="매장 번호"
            aria-label="매장 번호"
            className={INPUT}
          />
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            placeholder="한 번 더"
            aria-label="매장 번호 확인"
            className={INPUT}
          />
          {error && (
            <p role="alert" className="text-[13px] font-semibold text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className={`${BTN_PRIMARY} flex-1`}
              onClick={() => {
                if (pin.length < 4) return setError("4자리 이상으로 해주세요.");
                if (pin !== confirm) return setError("두 번 입력한 번호가 다릅니다.");
                if (!setPin(pin)) return setError("이 태블릿에 저장할 수 없습니다.");
                setLocked(true);
                setSetup(false);
                setPinInput("");
                setConfirm("");
                setError("");
              }}
            >
              만들기
            </button>
            <button type="button" className={BTN} onClick={() => setSetup(false)}>
              그만두기
            </button>
          </div>
        </div>
      </Card>
    );
  }

  if (!locked) {
    return (
      <button
        type="button"
        onClick={() => setSetup(true)}
        className="mt-3 w-full rounded-2xl border-2 border-dashed border-zinc-300 px-4 py-3 text-[13px] font-semibold text-zinc-600 active:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300"
      >
        🔐 레시피에 매장 번호 걸기
      </button>
    );
  }

  return (
    <p className="mt-3 text-center text-[12px] text-zinc-500 dark:text-zinc-400">
      🔐 레시피는 매장 번호로 가려집니다 · 링크는 매장 밖으로 보내지 마세요
    </p>
  );
}
