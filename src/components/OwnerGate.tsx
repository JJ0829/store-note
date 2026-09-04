"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { checkPin, hasPin, isUnlocked, lock, needsPin, setPin, unlock } from "@/lib/ownerGate";
import { BTN, BTN_PRIMARY, Card, INPUT, Screen } from "@/components/ui";

/* ------------------------------------------------------------------ *
 * 사장님 영역을 감싼다.
 *
 * 매출·시급·계약 조건·거래처 단가는 공용 태블릿 첫 화면에 그냥 있으면
 * 안 되는 것들이다. 홀 직원이 태블릿을 만지다가 동료 시급을 보는 일은
 * 실제로 일어난다.
 *
 * ⚠ 이건 가리개다. 보안이 아니다 — `src/lib/ownerGate.ts`에 적어둔 대로
 *   태블릿을 가진 사람이 개발자도구를 열면 그대로 읽힌다. 진짜 접근
 *   통제는 서버(Supabase RLS)로 가야 하고 그건 배포 작업이다.
 *
 * 처음 쓰는 사람을 가두지 않는다 — PIN을 아직 안 만들었으면 그냥 열린다.
 * ------------------------------------------------------------------ */

export default function OwnerGate({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  // 서버 렌더 때는 localStorage를 못 본다. 판단을 미룬다
  const [state, setState] = useState<"loading" | "open" | "locked" | "setup">(
    "loading",
  );
  const [pin, setPinInput] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

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

  if (state === "open") {
    return <>{children}</>;
  }

  /* ---------- PIN 만들기 ---------- */
  if (state === "setup") {
    return (
      <Screen title={title}>
        <Card
          className="mt-5"
          title="잠금번호 만들기"
          note="숫자 4자리 이상. 이 태블릿에만 저장됩니다. 잊으면 되돌릴 수 없으니 사장님만 아는 번호로 하세요."
        >
          <div className="mt-3 flex flex-col gap-2">
            <input
              value={pin}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              placeholder="잠금번호"
              aria-label="잠금번호"
              className={INPUT}
            />
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              placeholder="한 번 더"
              aria-label="잠금번호 확인"
              className={INPUT}
            />
            {error && (
              <p className="text-[13px] font-semibold text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <button
              type="button"
              className={BTN_PRIMARY}
              onClick={() => {
                if (pin.length < 4) return setError("4자리 이상으로 해주세요.");
                if (pin !== confirm) return setError("두 번 입력한 번호가 다릅니다.");
                if (!setPin(pin)) return setError("이 태블릿에 저장할 수 없습니다.");
                setError("");
                setState("open");
              }}
            >
              만들고 들어가기
            </button>
          </div>

          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            이 잠금은 <b>다른 직원이 실수로 열어보는 것</b>까지만 막습니다.
            기기를 가진 사람이 브라우저 도구를 쓰면 볼 수 있습니다. 진짜
            차단은 서버를 붙일 때 됩니다.
          </p>
        </Card>
      </Screen>
    );
  }

  /* ---------- 잠금 해제 ---------- */
  return (
    <Screen title={title}>
      <Card className="mt-5" title="사장님 화면입니다" note="잠금번호를 넣어주세요.">
        <div className="mt-3 flex flex-col gap-2">
          <input
            value={pin}
            onChange={(e) => {
              setPinInput(e.target.value.replace(/\D/g, ""));
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (checkPin(pin)) {
                unlock();
                setState("open");
              } else setError("번호가 맞지 않습니다.");
            }}
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            placeholder="잠금번호"
            aria-label="잠금번호"
            className={INPUT}
          />
          {error && (
            <p className="text-[13px] font-semibold text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <button
            type="button"
            className={BTN_PRIMARY}
            onClick={() => {
              if (checkPin(pin)) {
                unlock();
                setState("open");
              } else setError("번호가 맞지 않습니다.");
            }}
          >
            열기
          </button>
        </div>
      </Card>
    </Screen>
  );
}

/**
 * 첫 화면에 두는 "잠금 걸기" 버튼.
 *
 * 잠금이 없으면 만들라고 권하고, 있으면 지금 잠근다.
 * 화면 안에 만들 곳이 없으면 아무도 PIN을 만들지 않는다.
 */
export function OwnerLockButton() {
  const router = useRouter();
  // 잠그기를 누르면 문구가 바로 바뀌어야 한다 (needsPin()은 상태가 아니라 함수다)
  const [, setTick] = useState(0);
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
        title="잠금번호 만들기"
        note="숫자 4자리 이상. 매출·시급·거래처 단가 화면이 잠깁니다."
      >
        <div className="mt-3 flex flex-col gap-2">
          <input
            value={pin}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            placeholder="잠금번호"
            aria-label="잠금번호"
            className={INPUT}
          />
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            placeholder="한 번 더"
            aria-label="잠금번호 확인"
            className={INPUT}
          />
          {error && (
            <p className="text-[13px] font-semibold text-red-600 dark:text-red-400">
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
        🔒 매출·시급 화면에 잠금번호 걸기
      </button>
    );
  }

  const openNow = !needsPin();

  return (
    <div className="mt-3 text-center">
      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
        🔒 사장님 화면은 잠금번호로 보호됩니다
        {openNow ? " · 지금 열려 있음" : ""}
      </p>

      {/*
        수동 잠그기.

        브라우저를 닫으면 알아서 잠기지만, 매장 태블릿은 하루 종일 켜져 있다.
        사장님이 매출을 보고 자리를 비우면 다음 사람이 그대로 본다.
        문서 감사에서 lock()이 아무 데서도 호출되지 않는 걸 찾아 붙였다.
      */}
      {openNow && (
        <button
          type="button"
          onClick={() => {
            lock();
            setLocked(true);
            // 지금 화면이 사장님 영역이면 즉시 잠금 화면으로 돌아가야 한다
            router.refresh();
            setTick((n) => n + 1);
          }}
          className="mt-2 rounded-xl border-2 border-zinc-300 px-4 py-2 text-[13px] font-semibold text-zinc-600 active:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300"
        >
          지금 잠그기
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 화면 일부만 가리기.
 *
 * 출퇴근 화면은 잠글 수 없다 — 직원이 직접 찍어야 하니까.
 * 그런데 같은 화면의 [이번 주] 탭에는 시급과 인건비가 있다.
 * 그래서 화면 전체가 아니라 **그 부분만** 가린다.
 * ------------------------------------------------------------------ */

export function useOwnerOpen(): { ready: boolean; open: boolean; setOpen: (v: boolean) => void } {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setReady(true);
    // PIN을 아직 안 만들었으면 가리지 않는다
    setOpen(!hasPin() || isUnlocked());
  }, []);

  return { ready, open, setOpen };
}

/** 가려진 자리에 대신 놓는 잠금 해제 칸 */
export function InlineUnlock({
  what,
  onOpen,
}: {
  what: string;
  onOpen: () => void;
}) {
  const [pin, setPinInput] = useState("");
  const [error, setError] = useState("");

  function tryOpen() {
    if (checkPin(pin)) {
      unlock();
      onOpen();
    } else setError("번호가 맞지 않습니다.");
  }

  return (
    <div className="rounded-2xl border-2 border-dashed border-zinc-300 p-4 text-center dark:border-zinc-700">
      <p className="text-[13px] font-semibold">🔒 {what}</p>
      <p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">
        사장님 잠금번호가 필요합니다.
      </p>
      <div className="mx-auto mt-3 flex max-w-[280px] gap-2">
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
          placeholder="잠금번호"
          aria-label="잠금번호"
          className={INPUT}
        />
        <button type="button" onClick={tryOpen} className={BTN}>
          열기
        </button>
      </div>
      {error && (
        <p className="mt-2 text-[12px] font-semibold text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
