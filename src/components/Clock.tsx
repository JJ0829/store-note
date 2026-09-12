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
    /* 분이 바뀔 때만 다시 그린다. 초까지 두면 1초마다 화면이 흔들리고,
       주방에서 초 단위가 필요한 화면이 아니다. */
    const id = setInterval(() => setNow(new Date()), 30_000);
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
