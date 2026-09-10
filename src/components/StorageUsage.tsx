"use client";

import { useEffect, useState } from "react";
import { Card, Caveat, Row } from "@/components/ui";
import {
  bytesLabel,
  GROWING_KEYS,
  KEY_LABEL,
  storageUsage,
  type UsageRow,
} from "@/lib/storageHealth";

/* ------------------------------------------------------------------ *
 * 저장 공간이 얼마나 찼는가.
 *
 * ★ 왜 백업 화면에 두는가 — **여기가 유일하게 할 수 있는 일이 있는 곳**이다.
 *   공간이 차면 출퇴근을 못 찍게 되는데, 그때 알면 늦다. 미리 보이게 두고,
 *   보이는 자리에서 바로 받아서 뺄 수 있게 한다.
 *
 * ⚠️ 브라우저는 남은 용량을 안 알려준다. 그래서 **우리가 넣은 것의 크기**만
 *   말하고 "몇 % 찼다" 는 말은 하지 않는다. 한계는 브라우저마다 다르고
 *   (보통 5MB), 지어낸 비율을 보여주면 사장님이 그 숫자를 믿는다.
 * ------------------------------------------------------------------ */

/** 이쯤부터는 한 번 봐두는 게 좋다. 한계(보통 5MB)의 절반쯤 */
const WATCH_BYTES = 2 * 1024 * 1024;

export default function StorageUsage() {
  const [usage, setUsage] = useState<{ total: number; rows: UsageRow[] } | null>(
    null,
  );

  useEffect(() => {
    setUsage(storageUsage());
  }, []);

  if (!usage) return null;

  const growing = usage.rows.filter((r) =>
    (GROWING_KEYS as readonly string[]).includes(r.key),
  );
  const growingTotal = growing.reduce((s, r) => s + r.bytes, 0);

  return (
    <Card
      className="mt-5"
      title="저장 공간"
      note="이 태블릿 브라우저가 들고 있는 양입니다."
    >
      <div className="mt-2">
        <Row label="전체" value={bytesLabel(usage.total)} />
        {usage.rows.slice(0, 5).map((r) => (
          <Row
            key={r.key}
            label={KEY_LABEL[r.key] ?? r.key}
            value={bytesLabel(r.bytes)}
          />
        ))}
      </div>

      {usage.total >= WATCH_BYTES && (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
        >
          <b>꽤 찼습니다.</b> 브라우저가 더는 못 받으면 그때부터 출퇴근이 안
          남습니다. 지금 전체 백업을 받아 두세요.
        </p>
      )}

      <Caveat>
        출퇴근 · 매출 · 발주는 날마다 쌓이고 <b>지우는 방법이 없습니다</b> (지금
        {" "}
        {bytesLabel(growingTotal)}). 근로기준법이 3년 보존을 요구해서 앱이 임의로
        지우지 않습니다. 브라우저마다 한계가 달라 <b>몇 % 찼는지는 알 수
        없습니다</b> — 그래서 비율 대신 크기만 보여드립니다.
      </Caveat>
    </Card>
  );
}
