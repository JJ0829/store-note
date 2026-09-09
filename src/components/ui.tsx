"use client";

import type { ReactNode } from "react";
import BackButton from "@/components/BackButton";

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
  wide,
  right,
  children,
}: {
  title: string;
  storeName?: string;
  /** "저장됨"을 잠깐 띄운다 */
  saved?: boolean;
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
