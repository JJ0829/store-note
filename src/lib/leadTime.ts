/* ------------------------------------------------------------------ *
 * 리드타임 계산.
 *
 * 원래 PrepView.tsx 안에 있던 함수들이다. 옮긴 이유는 하나다 —
 * `.tsx` 안에 있으면 테스트를 돌릴 수 없다. Node의 타입 스트리핑은
 * 타입은 벗기지만 JSX는 못 벗겨서 `.tsx`를 아예 읽지 못한다.
 * (ERR_UNKNOWN_FILE_EXTENSION)
 *
 * 그리고 이 계산들은 이 제품에서 틀리면 안 되는 곳이다.
 *   - readyAt이 틀리면 콜드브루·반죽이 내일 아침에 없다. 돈으로 못 메운다.
 *   - arrivesIn이 틀리면 금요일 발주를 화요일 도착으로 안내한다.
 *
 * 옮기면서 `now`를 인자로 받게 바꿨다. 안에서 `new Date()`를 부르면
 * 테스트가 "오늘이 무슨 요일이냐"에 따라 통과했다 실패했다 한다.
 * 호출부는 인자를 안 넘기면 이전과 똑같이 동작한다.
 * ------------------------------------------------------------------ */

import type { Trigger } from "@/lib/types";

export const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** 자정 기준으로 며칠 뒤인지. 8/31 → 9/1 같은 월말을 그냥 빼면 틀린다. */
export function daysApart(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** 지금 걸면 언제 쓸 수 있는지. 종이가 못 하는 계산이 이거다. */
export function readyAt(hours: number, now: Date = new Date()): string {
  const d = new Date(now.getTime() + hours * 3600 * 1000);
  const diff = daysApart(now, d);
  const day =
    diff === 0
      ? "오늘"
      : diff === 1
        ? "내일"
        : diff === 2
          ? "모레"
          : `${d.getMonth() + 1}/${d.getDate()}`;
  return `${day} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

function isWeekend(d: Date): boolean {
  const g = d.getDay();
  return g === 0 || g === 6;
}

/**
 * 발주하면 언제 오는지.
 *
 * 주말을 건너뛴다. 거래처는 토·일에 배송하지 않는다(조사 확인).
 * 이걸 안 하면 "9/6(일) 도착"처럼 실제로 오지 않는 날짜를 알려주게 되고,
 * 그러면 금요일 발주의 무게가 화면에서 사라진다.
 *
 * 마지막 while이 필요한 이유: 예전 코드는 `while (left > 0)` 하나뿐이라
 * 당일배송(0일) 거래처를 넣으면 루프가 아예 안 돌아 토요일 발주가
 * "토요일 도착"으로 나왔다. 주말 배송이 없다는 게 이 함수의 존재 이유인데
 * 0일에서만 그 규칙이 통째로 빠져 있었다. 테스트가 잡아낸 버그다.
 */
export function arrivesIn(
  days: number,
  now: Date = new Date(),
): { label: string; overWeekend: boolean } {
  // 자정으로 맞춰서 센다. 시각이 섞이면 setDate 반복에서 오차가 난다
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let left = Math.max(0, Math.round(days));
  let skipped = 0;

  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (isWeekend(d)) {
      skipped += 1;
      continue; // 주말은 배송일로 세지 않는다
    }
    left -= 1;
  }

  // 0일(당일배송)이어도 토·일에는 오지 않는다
  while (isWeekend(d)) {
    d.setDate(d.getDate() + 1);
    skipped += 1;
  }

  return {
    label: `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY[d.getDay()]})`,
    overWeekend: skipped > 0,
  };
}

export function triggerLabel(t: Trigger): string {
  switch (t.type) {
    case "daily":
      return `매일 ${t.at}`;
    case "weekday":
      return `${t.days.map((d) => WEEKDAY[d]).join("·")} ${t.at}`;
    case "condition":
      return t.when;
    case "cycle":
      return t.everyDays >= 365
        ? "1년마다"
        : t.everyDays >= 30
          ? `${Math.round(t.everyDays / 30)}개월마다`
          : `${t.everyDays}일마다`;
  }
}
