"use client";

import { useEffect, useState } from "react";

/* ------------------------------------------------------------------ *
 * 첫 화면 제목 옆의 날짜 · 시각.
 *
 * ★ 매장 태블릿은 하루 종일 켜져 있다. 아침에 켠 화면을 저녁에 보는 일이
 *   실제로 있어서, «지금 몇 시인가» 가 화면에 없으면 **어제 것을 보고 있는지
 *   오늘 것을 보고 있는지** 알 방법이 없다. (사장님 요청 2026-09-12)
 *
 * ⚠️ 서버에서는 시각을 모른다. 서버가 그린 글자와 브라우저가 그린 글자가
 *   다르면 하이드레이션이 깨지므로, **붙기 전에는 아무것도 안 그린다.**
 *   자리는 `min-h` 로 잡아둬서 붙는 순간 제목이 밀리지 않게 한다.
 * ------------------------------------------------------------------ */
export default function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    /* ★ 1초마다 본다. 표시는 분까지지만, 30초마다 보면 **분이 최대 30초 늦게
       바뀐다** — 사장님이 "실시간 맞냐" 고 물은 지점이 정확히 그것이다.
       그릴 글자가 같으면 리액트가 DOM 을 안 건드리므로 화면은 안 흔들린다. */
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const p = (n: number) => String(n).padStart(2, "0");

  return (
    <span
      className="ml-2 inline-block min-w-[128px] font-mono text-[13px] font-normal tabular-nums text-zinc-500 dark:text-zinc-400"
      /* 시각이 바뀔 때마다 스크린리더가 읽으면 방해만 된다 */
      aria-hidden={now === null ? true : undefined}
    >
      {now &&
        `${now.getFullYear()}.${p(now.getMonth() + 1)}.${p(now.getDate())} ` +
          `${p(now.getHours())}:${p(now.getMinutes())}`}
    </span>
  );
}
