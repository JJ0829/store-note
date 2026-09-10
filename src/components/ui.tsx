"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import BackButton from "@/components/BackButton";
import { eun } from "@/lib/store";

/* ------------------------------------------------------------------ *
 * 화면 여섯 개(원가·근태·매출·발주·거래처·계약서)가 같이 쓰는 껍데기.
 *
 * 같은 클래스 문자열을 화면마다 베껴 쓰면 한 군데만 고쳐서
 * 화면끼리 미묘하게 달라진다. 주방 태블릿은 젖은 손으로 누르므로
 * 버튼·입력칸 높이가 화면마다 다르면 바로 오조작이 된다.
 * ------------------------------------------------------------------ */

/** 입력칸. 16px 미만으로 두면 iOS 사파리가 눌렀을 때 화면을 확대한다 */
export const INPUT =
  "w-full rounded-xl border-2 border-zinc-300 bg-white px-3 py-2.5 text-[16px] outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-900";

export const CARD =
  "rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900";

export const BTN =
  "rounded-xl border-2 border-zinc-300 px-3 py-2.5 text-[14px] font-semibold active:bg-zinc-100 dark:border-zinc-700 dark:active:bg-zinc-800";

export const BTN_PRIMARY =
  "rounded-xl bg-orange-500 px-4 py-3 text-[15px] font-bold text-white active:bg-orange-600";

export function Screen({
  title,
  storeName,
  saved,
  saveFailed,
  wide,
  right,
  children,
}: {
  title: string;
  storeName?: string;
  /** "저장됨"을 잠깐 띄운다 */
  saved?: boolean;
  /**
   * ★ 저장이 안 됐다. `useSaveState()`가 넘겨준다.
   *
   * 성공은 1.2초 뒤 사라지지만 **실패는 스스로 사라지지 않는다** —
   * 사람이 보고 손을 써야 하는 일이기 때문이다.
   */
  saveFailed?: SaveFailure[] | null;
  /** 표가 들어가는 화면은 넓게 */
  wide?: boolean;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main
      className={[
        "mx-auto min-h-dvh w-full bg-zinc-50 px-4 py-6 pb-24 dark:bg-zinc-950",
        wide ? "max-w-[900px]" : "max-w-[560px]",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <BackButton />
        <div className="min-w-0 flex-1">
          {storeName && (
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {storeName}
            </p>
          )}
          <h1 className="text-xl font-bold">{title}</h1>
        </div>
        {/* 저장은 사용자가 누른 결과인데 화면에만 뜨면 스크린리더는 모른다.
            polite 라 하던 낭독을 끊지 않는다 */}
        {saved && (
          <span
            role="status"
            aria-live="polite"
            className="shrink-0 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400"
          >
            저장됨
          </span>
        )}
        {right}
      </div>
      {saveFailed && saveFailed.length > 0 && <SaveFailed failures={saveFailed} />}
      {children}
    </main>
  );
}

export function Card({
  title,
  note,
  children,
  className = "",
}: {
  title?: string;
  note?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${CARD} ${className}`}>
      {title && <h2 className="text-[15px] font-bold">{title}</h2>}
      {note && (
        <p className="mt-1 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {note}
        </p>
      )}
      {children}
    </section>
  );
}

/** 이름 + 값 한 줄. 금액을 오른쪽에 몰아둔다 */
export function Row({
  label,
  value,
  strong,
  danger,
}: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span
        className={[
          "min-w-0 text-[13px]",
          strong ? "font-bold" : "text-zinc-600 dark:text-zinc-300",
        ].join(" ")}
      >
        {label}
      </span>
      <span
        className={[
          "shrink-0 font-mono tabular-nums",
          strong ? "text-[17px] font-bold" : "text-[14px]",
          danger ? "text-red-600 dark:text-red-400" : "",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

/** 눌러서 켜고 끄는 칩. 요일 고르기·섹션 고르기에 쓴다 */
export function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={[
        "rounded-lg border-2 px-3 py-1.5 text-[13px] font-semibold",
        on
          ? "border-orange-500 bg-orange-500 text-white"
          : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/**
 * 숫자 입력.
 *
 * `type="number"`를 쓰면 주방 태블릿에서 스크롤할 때 값이 바뀌는 사고가
 * 있다. 그래서 text + inputMode로 숫자 키패드만 띄운다.
 */
export function NumField({
  value,
  onChange,
  placeholder,
  label,
  suffix,
  className = "",
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  label: string;
  suffix?: string;
  className?: string;
}) {
  return (
    <label className={`flex items-center gap-1.5 ${className}`}>
      <span className="sr-only">{label}</span>
      <input
        value={value === 0 ? "" : String(value)}
        onChange={(e) => {
          // 쉼표를 붙여 넣는 사람이 많다 (28,000)
          const cleaned = e.target.value.replace(/[^\d.]/g, "");
          onChange(cleaned === "" ? 0 : Number(cleaned));
        }}
        inputMode="decimal"
        placeholder={placeholder}
        aria-label={label}
        className={`${INPUT} text-right font-mono tabular-nums`}
      />
      {suffix && (
        <span className="shrink-0 text-[13px] text-zinc-500 dark:text-zinc-400">
          {suffix}
        </span>
      )}
    </label>
  );
}

/** 비어 있을 때 뭘 해야 하는지 알려준다. 빈 화면만 띄우면 사람이 나간다 */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border-2 border-dashed border-zinc-300 px-4 py-8 text-center text-[13px] leading-relaxed text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
      {children}
    </p>
  );
}

/** 추정치·법적 주의 같은 "그대로 믿으면 안 되는 것" 표시 */
export function Caveat({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ *
 * 저장 결과 알림
 *
 * ★ 2026-09-09 에 생긴 이유 — 실패가 조용했다.
 *
 *   원래 꼴은 이랬다.
 *       setPunches(next);              // 화면은 이미 바뀌었다
 *       if (savePunches(next)) {       // 성공하면
 *         setSaved(true);              //   "저장됨" 을 1.2초 띄운다
 *       }                              // 실패하면 — 아무 말도 없다
 *
 *   **화면이 바뀌어 있으니 사람은 저장된 줄 안다.** 실제로는 React 메모리에만
 *   있고 새로고침하면 사라진다. 사파리 시크릿 모드, 저장 공간 초과,
 *   브라우저의 사이트 데이터 차단에서 실제로 일어난다.
 *   출퇴근이 이 경로를 타면 **급여가 틀린다.**
 *
 * 기준 (docs/deliverables/21_화면명세.md §7-①):
 *   나중에 다시 읽어야 하는 기록(출퇴근·계약·거래처·매출·근무표·설정·발주)은
 *   **실패를 반드시 알린다.** 체크리스트·프렙처럼 그날 지나면 지워질 것은
 *   조용해도 된다 — 체크를 잃어도 그날 일은 계속해야 하니까.
 * ------------------------------------------------------------------ */

export type SaveFailure = {
  /** 무엇이 안 남았는지. "출퇴근 기록" 처럼 사람이 읽는 말로 */
  what: string;
  /** 다시 시도. 같은 값을 한 번 더 저장해 본다 */
  retry?: () => void;
};

/**
 * 저장 성공·실패를 화면에 알린다.
 *
 * `report(ok)` 한 줄로 끝난다 — 화면마다 타이머를 따로 두면 한 군데서만
 * 빼먹는다. `saved` 는 1.2초 뒤 저절로 사라지고 **`failed` 는 안 사라진다.**
 */
export function useSaveState() {
  const [saved, setSaved] = useState(false);
  /* ★ 대상별로 들고 있는다 (2026-09-10 점검에서 발견).
     예전에는 `failed` 가 boolean 하나여서 **성공 한 번이 다른 기록의 실패
     경고를 지웠다** — 계약 저장이 실패한 채로 설정을 고치면 경고가 사라졌다.
     그리고 재시도 버튼이 화면당 하나라 **엉뚱한 것을 다시 저장**했다. */
  const [failures, setFailures] = useState<SaveFailure[]>([]);
  const timer = useRef<number | null>(null);

  /**
   * `report("출퇴근 기록", savePunches(next), () => ...)`
   *
   * 같은 `what` 이 다시 성공하면 그 경고만 사라진다. 다른 대상의 경고는 남는다.
   */
  const report = useCallback(
    (what: string, ok: boolean, retry?: () => void): boolean => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      setFailures((prev) => {
        const rest = prev.filter((f) => f.what !== what);
        return ok ? rest : [...rest, { what, retry }];
      });
      if (ok) {
        setSaved(true);
        timer.current = window.setTimeout(() => setSaved(false), 1200);
      } else {
        // 실패는 지우지 않는다. 사람이 봐야 한다
        setSaved(false);
      }
      return ok;
    },
    [],
  );

  // 화면을 떠날 때 타이머가 남으면 사라진 컴포넌트에 setState 한다
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return { saved, failures, report };
}

/**
 * 저장 실패 띠. `Screen` 이 머리말 바로 아래에 띄운다.
 *
 * `role="alert"` 이라 스크린리더가 즉시 읽는다 — 저장은 사람이 누른 결과이고
 * 실패는 **하던 일을 멈춰야 하는** 소식이라 `polite` 가 아니다.
 *
 * ★ **여러 개가 동시에 실패할 수 있다.** 계약과 설정이 각각 실패했는데
 *   하나만 보여주면 나머지는 조용히 잃는다. 전부 그린다.
 */
export function SaveFailed({ failures }: { failures: SaveFailure[] }) {
  if (failures.length === 0) return null;
  return (
    <div
      role="alert"
      className="mt-4 rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/40"
    >
      <p className="text-[14px] font-bold text-red-800 dark:text-red-200">
        저장에 실패했습니다
      </p>
      <ul className="mt-1 flex flex-col gap-2">
        {failures.map((f) => (
          <li key={f.what}>
            <p className="text-[12.5px] leading-relaxed text-red-800/90 dark:text-red-300/90">
              {/* eun() 은 낱말까지 같이 돌려준다 — "발주 기록은" */}
              브라우저 저장 공간을 확인해 주세요. <b>{eun(f.what)} 아직 남지
              않았습니다</b> — 화면을 새로 열면 사라집니다.
            </p>
            {f.retry && (
              <button
                type="button"
                onClick={f.retry}
                className="mt-1.5 rounded-xl border-2 border-red-300 px-3 py-2 text-[13px] font-semibold text-red-700 active:bg-red-100 dark:border-red-900 dark:text-red-300 dark:active:bg-red-950"
              >
                {f.what} 다시 시도
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
